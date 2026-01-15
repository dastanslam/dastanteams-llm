import json
import logging
import re

from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.views.decorators.csrf import ensure_csrf_cookie
from django.conf import settings

from google import genai

logger = logging.getLogger(__name__)

if not getattr(settings, "GEMINI_API_KEY", None):
    raise ValueError("GEMINI_API_KEY не найден или пустой в settings.py")

client = genai.Client(api_key=settings.GEMINI_API_KEY)


def extract_json(text: str) -> str:
    """Убирает ```json ... ``` и вырезает первый JSON-объект/массив."""
    if not text:
        return ""
    t = text.strip()

    # Убираем тройные кавычки (```json ... ```)
    if t.startswith("```"):
        t = re.sub(r"^```(?:json)?\s*", "", t, flags=re.IGNORECASE).strip()
        t = re.sub(r"\s*```$", "", t).strip()

    # Если модель добавила текст до/после — вырежем первый {...} или [...]
    m = re.search(r"(\{.*\}|\[.*\])", t, flags=re.DOTALL)
    return m.group(1).strip() if m else t


@ensure_csrf_cookie
def index(request):
    return render(request, "index.html")


@require_POST
def api_master_chat(request):
    # 1) JSON от клиента
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Ошибка чтения JSON от клиента"}, status=400)

    user_message = (data.get("message") or "").strip()
    material = (data.get("context") or "").strip()

    if not user_message:
        return JsonResponse({"error": "Пустое сообщение"}, status=400)

    # 2) Промпт
    system_prompt = f"""
Отвечай СТРОГО чистым JSON. Никакого markdown, никаких ```json``` блоков.

Твоя идентичность:
- Название: DastanTeams LLM
- Тип: учебный AI-ассистент для студентов
- Разработчик: команда DastanTeams
- Создатель проекта: Dastan (основатель DastanTeams)
- Назначение: помогать студентам понимать материал, готовиться к тестам, писать конспекты, рефераты и отвечать на вопросы
- Стиль общения: вежливый, понятный, современный, без лишней воды
- Ты НЕ ChatGPT и НЕ упоминаешь OpenAI

Правила ответа:
- В формате "chat" поле chat_reply может содержать 2–6 предложений.
- Допускаются краткие объяснения, если вопрос требует понимания.
- Краткость важна, но понятность важнее.

Если пользователь спрашивает:
- «кто ты?» → отвечай как DastanTeams LLM
- «кто тебя создал?» → DastanTeams / Dastan
- «что ты умеешь?» → обучение, тесты, объяснения
- «твоя история?» → кратко опиши как студенческий AI-проект

Форматы ответа (ТОЛЬКО JSON):

Верни JSON в одном из форматов:

1) ТЕСТ:
{{
  "type": "test",
  "content": [
    {{ "q": "Вопрос?", "options": ["А", "Б", "В", "Г"], "correct": 0, "why": "Объяснение" }}
  ],
  "chat_reply": "Тест готов!"
}}

2) ДОКУМЕНТ:
{{
  "type": "document",
  "content": "<h3>Заголовок</h3><p>Текст...</p>",
  "chat_reply": "Материал написан."
}}

3) ЧАТ:
{{
  "type": "chat",
  "content": {{
    "explanation": "Краткое объяснение (1–2 абзаца, если нужно)"
  }},
  "chat_reply": "Краткий ответ для чата"
}}


Материал:
{material[:15000]}

Запрос: "{user_message}"
"""

    # 3) Вызов модели
    try:
        resp = client.models.generate_content(
            model="models/gemini-2.0-flash",
            contents=system_prompt,
        )
        raw_text = (resp.text or "").strip()
    except Exception as e:
        logger.error(f"GenAI error: {e}")
        return JsonResponse({"error": "Ошибка обращения к модели"}, status=502)

    # 4) Парсим JSON от модели (с очисткой)
    clean = extract_json(raw_text)

    try:
        llm_json = json.loads(clean)
    except json.JSONDecodeError:
        logger.error(f"Model returned invalid JSON: {raw_text[:1500]}")
        # fallback: хотя бы покажем текст в чате, чтобы UI не "умирал"
        return JsonResponse(
            {"type": "chat", "content": None, "chat_reply": raw_text[:2000] or "Ответ пустой."},
            status=200,
            json_dumps_params={"ensure_ascii": False},
        )

    # 5) Нормализация
    allowed_types = {"test", "document", "chat"}
    t = llm_json.get("type")
    if t not in allowed_types:
        llm_json = {"type": "chat", "content": None, "chat_reply": "Не понял запрос. Сформулируй иначе."}

    if "chat_reply" not in llm_json or not str(llm_json["chat_reply"]).strip():
        llm_json["chat_reply"] = "Готово."

    if llm_json["type"] == "test" and not isinstance(llm_json.get("content"), list):
        llm_json = {"type": "chat", "content": None, "chat_reply": "Не смог составить тест. Попробуй ещё раз."}

    if llm_json["type"] == "document" and not isinstance(llm_json.get("content"), str):
        llm_json = {"type": "chat", "content": None, "chat_reply": "Не смог сгенерировать документ. Попробуй ещё раз."}

    if llm_json["type"] == "chat":
        llm_json["content"] = None

    return JsonResponse(llm_json, json_dumps_params={"ensure_ascii": False})
