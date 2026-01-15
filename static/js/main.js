// ==============================
// Helpers
// ==============================
function getCookie(name) {
  const m = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[2]) : null;
}

function appendMessage(container, text, cls) {
  const div = document.createElement('div');
  div.className = `message ${cls}`;
  div.textContent = text; // важно: защищает от XSS
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function setResultPlaceholder(text = 'Попросите что-нибудь в чате (например: "Сделай тест" или "Напиши эссе")...') {
  const resultContainer = document.getElementById('resultContainer');
  resultContainer.innerHTML = '';
  const p = document.createElement('p');
  p.style.color = 'gray';
  p.style.textAlign = 'center';
  p.style.marginTop = '50px';
  p.textContent = text;
  resultContainer.appendChild(p);
}

function showResultInfo(text) {
  const resultContainer = document.getElementById('resultContainer');
  resultContainer.innerHTML = '';
  const p = document.createElement('p');
  p.style.color = '#6B7280';
  p.style.lineHeight = '1.6';
  p.textContent = text;
  resultContainer.appendChild(p);
}

function showResultError(text) {
  const resultContainer = document.getElementById('resultContainer');
  resultContainer.innerHTML = '';
  const p = document.createElement('p');
  p.style.color = '#b91c1c';
  p.style.lineHeight = '1.6';
  p.textContent = text;
  resultContainer.appendChild(p);
}

// ==============================
// Rendering
// ==============================
function renderTest(questions) {
  const container = document.getElementById('resultContainer');
  container.innerHTML = '';

  const title = document.createElement('h3');
  title.innerHTML = '<i class="fas fa-check-square"></i> Проверь себя';
  container.appendChild(title);

  questions.forEach((q, index) => {
    const card = document.createElement('div');
    card.className = 'test-card';

    const qTitle = document.createElement('div');
    qTitle.className = 'question-title';
    qTitle.textContent = `${index + 1}. ${q.q}`;
    card.appendChild(qTitle);

    const optionsWrapper = document.createElement('div');
    optionsWrapper.className = 'options-wrapper';

    q.options.forEach((opt, optIndex) => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.type = 'button';
      btn.textContent = opt;

      // data-* вместо onclick строки (надежно)
      btn.dataset.correct = String(q.correct);
      btn.dataset.index = String(optIndex);
      btn.dataset.why = q.why || '';

      btn.addEventListener('click', () => {
        checkAnswer(btn, Number(btn.dataset.correct), Number(btn.dataset.index), btn.dataset.why);
      });

      optionsWrapper.appendChild(btn);
    });

    card.appendChild(optionsWrapper);

    const explanation = document.createElement('div');
    explanation.className = 'explanation';
    explanation.style.display = 'none';
    explanation.style.marginTop = '10px';
    explanation.style.padding = '10px';
    explanation.style.background = '#f0fdf4';
    explanation.style.borderRadius = '8px';
    explanation.style.color = '#166534';
    explanation.style.fontSize = '0.9em';
    card.appendChild(explanation);

    container.appendChild(card);
  });
}

function renderDocument(htmlContent) {
  const container = document.getElementById('resultContainer');
  container.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.style.background = 'white';
  wrap.style.padding = '20px';
  wrap.style.borderRadius = '12px';
  wrap.style.lineHeight = '1.6';

  // ⚠️ Если htmlContent приходит от LLM/пользователя — это потенциально опасно.
  // Если ты доверяешь серверу и сам санитизируешь HTML на backend — оставляй.
  // Если не доверяешь — замени на wrap.textContent = htmlContent;
  wrap.innerHTML = htmlContent;

  container.appendChild(wrap);
}

// ==============================
// Answer checking
// ==============================
function checkAnswer(btn, correctIndex, clickedIndex, explanationText) {
  const card = btn.closest('.test-card');
  const explanationDiv = card.querySelector('.explanation');
  const allBtns = card.querySelectorAll('.option-btn');

  allBtns.forEach(b => (b.disabled = true));

  if (correctIndex === clickedIndex) {
    btn.classList.add('correct');
    btn.insertAdjacentHTML('beforeend', ' <i class="fas fa-check"></i>');
  } else {
    btn.classList.add('wrong');
    btn.insertAdjacentHTML('beforeend', ' <i class="fas fa-times"></i>');
    if (allBtns[correctIndex]) allBtns[correctIndex].classList.add('correct');
  }

  explanationDiv.style.display = 'block';
  explanationDiv.textContent = explanationText || 'Без объяснения.';
}

// ==============================
// Main send
// ==============================
async function sendMessage(forcedText = null) {
  const input = document.querySelector('.chat-input');
  const chatHistory = document.getElementById('chatHistory');
  const material = document.getElementById('sourceText').value || '';

  const msg = (forcedText !== null ? forcedText : input.value).trim();
  if (!msg) return;

  // 1) UI: add user message
  appendMessage(chatHistory, msg, 'msg-user');
  input.value = '';
  showResultInfo('Думаю...');

  // 2) Request
  const csrftoken = getCookie('csrftoken');

  try {
    const response = await fetch('/api/chat/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrftoken ? { 'X-CSRFToken': csrftoken } : {}),
      },
      body: JSON.stringify({ message: msg, context: material }),
    });

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error(`Сервер вернул не-JSON. Статус: ${response.status}`);
    }

    if (!response.ok) {
      throw new Error(data?.error || `Ошибка сервера. Статус: ${response.status}`);
    }

    // 3) Chat reply (optional)
    if (data.chat_reply && typeof data.chat_reply === 'string') {
  // защита: если вдруг туда попал JSON
  if (!data.chat_reply.trim().startsWith('{')) {
    appendMessage(chatHistory, data.chat_reply, 'msg-ai');
  }
}

    // 4) Render by type
    if (data.type === 'test') {
      if (!Array.isArray(data.content)) {
        throw new Error('Неверный формат теста (ожидался массив вопросов).');
      }
      renderTest(data.content);
    } else if (data.type === 'document') {
      renderDocument(String(data.content ?? ''));
    } else {
      // type === 'chat' или неизвестный
      setResultPlaceholder();
    }
  } catch (err) {
    console.error(err);
    appendMessage(chatHistory, 'Ошибка соединения или сервера :(', 'msg-ai');
    showResultError(String(err.message || err));
  }
}

// ==============================
// Bindings
// ==============================
document.addEventListener('DOMContentLoaded', () => {
  const input = document.querySelector('.chat-input');
  const sendBtn = document.querySelector('.btn-icon');
  const testBtn = document.querySelector('.btn-primary');

  // Enter -> send
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage();
  });

  // кнопка самолётик
  sendBtn.addEventListener('click', () => sendMessage());

  // кнопка "Создать тест" слева
  if (testBtn) {
    testBtn.addEventListener('click', () => sendMessage('Сделай тест'));
    // УБЕРИ onclick="alert(...)" из HTML, иначе будет двойная логика
  }

  // стартовый плейсхолдер справа
  setResultPlaceholder();
});

let demoRemoved = false;

function removeDemoMessages() {
  if (demoRemoved) return;

  document.querySelectorAll(".demo-message").forEach(el => el.remove());
  demoRemoved = true;
}

document.getElementById("chatSend").addEventListener("click", () => {
  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  if (!text) return;

  removeDemoMessages(); // 👈 ВАЖНО

  // добавляем сообщение пользователя
  addUserMessage(text);

  input.value = "";
});

document.getElementById("chatInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    document.getElementById("chatSend").click();
  }
});
