const TOKEN = '7695029405:AAFRN2U5NRGYS-ZjpRc54xTxQdOSc0EeYtE'; 
const WEBHOOK = '/endpoint';
const SECRET = 'ENV_BOT_SECRET';
const FALLBACK_UPLOAD_URL = "http://telegraph-7at.pages.dev/upload";
const DIRECT_UPLOAD_URL = "https://host.ashlynn-repo.workers.dev/?url=";
const CHANNEL_LINK = "https://t.me/Ashlynn_Repository"; 
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TOKEN}/`;

addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.pathname === WEBHOOK) {
    event.respondWith(handleWebhook(event));
  } else if (url.pathname === '/registerWebhook') {
    event.respondWith(registerWebhook(event, url, WEBHOOK, SECRET));
  } else if (url.pathname === '/unRegisterWebhook') {
    event.respondWith(unRegisterWebhook(event));
  } else {
    event.respondWith(new Response('No handler for this request'));
  }
});

// Handle requests to WEBHOOK
async function handleWebhook(event) {
  if (event.request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== SECRET) {
    return new Response('Unauthorized', { status: 403 });
  }

  const update = await event.request.json();
  event.waitUntil(onUpdate(update));
  return new Response('Ok');
}

async function onUpdate(update) {
  if (update.message) {
    await onMessage(update.message);
  }
}

// Handle incoming Message
async function onMessage(message) {
  const chatId = message.chat.id;
  const text = message.text;

  if (text === '/start') {
    await sendStartMessage(chatId);
  } else if (text === '/about') {
    await sendAboutMessage(chatId);
  } else if (text === '/admin') {
    await sendAdminMessage(chatId);
  } else if (message.photo || message.video) {
    await handleMediaMessage(message, chatId);
  } else if (message.document || message.audio) {
    await sendPlainText(chatId, "Please send only a photo or video under 20 MB.");
  } else {
    await sendPlainText(chatId, "Send a photo or video to receive a download link.");
  }
}

// Send Start message
async function sendStartMessage(chatId) {
  const text = "Welcome! Send me a photo or video under 20 MB, and I'll provide a download link.";
  await sendPlainText(chatId, text);
}

// Send About message
async function sendAboutMessage(chatId) {
  const text = "This bot assists with uploading media files quickly and provides direct download links.";
  await sendPlainText(chatId, text);
}

// Send Admin message with inline button to join the channel
async function sendAdminMessage(chatId) {
  const text = "Join our Telegram channel for updates!";
  const buttons = [[{ text: "Join Channel", url: CHANNEL_LINK }]];
  await sendMessageWithButtons(chatId, text, buttons);
}

async function handleMediaMessage(message, chatId) {
  const fileData = message.photo ? message.photo.slice(-1)[0] : message.video;
  if (!fileData) {
    await sendPlainText(chatId, "Please send only a photo or video under 20 MB.");
    return;
  }

  try {
    const fileUrl = await getTelegramFileUrl(fileData.file_id);
    if (!fileUrl) throw new Error("Could not retrieve file URL.");

    let uploadResult;
    let uploadedUrl;
    if (fileData.file_size && fileData.file_size <= 20 * 1024 * 1024) { // 20 MB limit
      uploadResult = await directUpload(fileUrl);
    } else {
      uploadResult = await uploadToApi(fileUrl);
    }

    uploadedUrl = uploadResult.uploadedUrl || uploadResult.data || null;
    if (!uploadedUrl) throw new Error("Upload response did not contain a URL.");

    const responseMessage = `⬇️ Download: <a href="${uploadedUrl}">Click here</a>`;
    const buttons = [[{ text: "View Upload", url: uploadedUrl }]];
    await sendMessageWithButtons(chatId, responseMessage, buttons);
  } catch (error) {
    await sendPlainText(chatId, `Upload failed: ${error.message}`);
  }
}

// Get the file URL from Telegram
async function getTelegramFileUrl(fileId) {
  const fileDataResponse = await fetch(apiUrl('getFile', { file_id: fileId }));
  const fileData = await fileDataResponse.json();

  if (!fileData.ok) throw new Error("Failed to retrieve file information from Telegram");
  return `https://api.telegram.org/file/bot${TOKEN}/${fileData.result.file_path}`;
}

// Directly upload to the custom API using GET
async function directUpload(fileUrl) {
  const directUploadResponse = await fetch(`${DIRECT_UPLOAD_URL}${encodeURIComponent(fileUrl)}`);
  if (!directUploadResponse.ok) {
    throw new Error(`Direct upload failed with status: ${directUploadResponse.status}`);
  }
  return await directUploadResponse.json();
}

// Fallback Upload using FormData
async function uploadToApi(fileUrl) {
  const mediaResponse = await fetch(fileUrl);
  if (!mediaResponse.ok) throw new Error("Failed to fetch file from Telegram");

  const mediaBlob = await mediaResponse.blob();
  const formData = new FormData();
  formData.append("file", mediaBlob, "uploaded_file");

  const uploadResponse = await fetch(FALLBACK_UPLOAD_URL, {
    method: "POST",
    body: formData
  });

  if (!uploadResponse.ok) {
    const errorMsg = await uploadResponse.text();
    throw new Error(`Upload failed: ${errorMsg}`);
  }

  return await uploadResponse.json();
}

// Send plain text message
async function sendPlainText(chatId, text) {
  const payload = {
    chat_id: chatId,
    text: text
  };
  return await fetch(`${TELEGRAM_API_URL}sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(response => response.json());
}

// Send message with inline buttons
async function sendMessageWithButtons(chatId, text, buttons) {
  const payload = {
    chat_id: chatId,
    text: text,
    reply_markup: { inline_keyboard: buttons },
    parse_mode: 'HTML'
  };
  return await fetch(`${TELEGRAM_API_URL}sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(response => response.json());
}

// Set webhook to this worker's URL
async function registerWebhook(event, requestUrl, suffix, secret) {
  const webhookUrl = `${requestUrl.protocol}//${requestUrl.hostname}${suffix}`;
  const r = await (await fetch(apiUrl('setWebhook', { url: webhookUrl, secret_token: secret }))).json();
  return new Response('ok' in r && r.ok ? 'Ok' : JSON.stringify(r, null, 2));
}

// Remove webhook
async function unRegisterWebhook(event) {
  const r = await (await fetch(apiUrl('setWebhook', { url: '' }))).json();
  return new Response('ok' in r && r.ok ? 'Ok' : JSON.stringify(r, null, 2));
}

// Return URL to Telegram API with optional parameters
function apiUrl(methodName, params = null) {
  let query = '';
  if (params) {
    query = '?' + new URLSearchParams(params).toString();
  }
  return `https://api.telegram.org/bot${TOKEN}/${methodName}${query}`;
}
