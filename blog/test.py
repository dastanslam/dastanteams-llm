from google import genai
from django.conf import settings

client = genai.Client(api_key=settings.GEMINI_API_KEY)

for m in client.models.list():
    # печатаем только те, что поддерживают generateContent
    methods = getattr(m, "supported_generation_methods", None)
    if methods and "generateContent" in methods:
        print(m.name, methods)
