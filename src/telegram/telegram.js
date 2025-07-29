const axios = require('axios');

async function sendTelegramMessage(chatId, message, options = {}) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!botToken) {
    throw new Error('TELEGRAM_BOT_TOKEN environment variable is not set');
  }
  
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  
  const payload = {
    chat_id: chatId,
    text: message,
    parse_mode: options.parseMode || 'HTML',
    disable_web_page_preview: options.disableWebPagePreview || false,
    disable_notification: options.disableNotification || false,
    ...options
  };

  console.log('Sending Telegram message:', JSON.stringify(payload, null, 2));

  try {
    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    console.log('Telegram message sent successfully');
    console.log(response.data);
    return response.data;
  } catch (error) {
    console.error('Error sending Telegram message:', error.response?.status || error.message);
    console.error(error.response?.data || error.message);
    throw error;
  }
}

async function sendTelegramPhoto(chatId, photoUrl, caption = '', options = {}) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!botToken) {
    throw new Error('TELEGRAM_BOT_TOKEN environment variable is not set');
  }
  
  const url = `https://api.telegram.org/bot${botToken}/sendPhoto`;
  
  const payload = {
    chat_id: chatId,
    photo: photoUrl,
    caption: caption,
    parse_mode: options.parseMode || 'HTML',
    disable_notification: options.disableNotification || false,
    ...options
  };

  console.log('Sending Telegram photo:', JSON.stringify(payload, null, 2));

  try {
    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    console.log('Telegram photo sent successfully');
    console.log(response.data);
    return response.data;
  } catch (error) {
    console.error('Error sending Telegram photo:', error.response?.status || error.message);
    console.error(error.response?.data || error.message);
    throw error;
  }
}

async function postTheGlobeArticleToTelegram(neonModel) {
  try {
    console.log('Posting TheGlobe article to Telegram:', JSON.stringify(neonModel, null, 2));
    
    // Extract article information from Neon model
    const modelData = neonModel.model?.data || neonModel.data || neonModel;
    
    // TODO: Change these when you gather model infos - extract from actual Neon model
    const title = modelData.title || "Untitled Article";
    const summary = modelData.summary || modelData.description || "No summary available";
    const articleUrl = modelData.url || "#"; // TODO: Build proper article URL
    const mainImageUrl = modelData.mainImageUrl || modelData.imageUrl || null; // TODO: Extract from actual image structure
    const author = modelData.author || "TheGlobe Staff";
    const publishedDate = modelData.publishedDate || modelData.pubInfo?.publicationTime || new Date().toISOString();
    
    // Get Telegram channel/chat ID from environment
    // TODO: Change this when you gather model infos - could be site-specific
    const chatId = process.env.TELEGRAM_THEGLOBE_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
    
    if (!chatId) {
      throw new Error('Telegram chat ID not configured. Set TELEGRAM_THEGLOBE_CHAT_ID or TELEGRAM_CHAT_ID environment variable');
    }
    
    // Format the message
    const messageText = formatArticleMessage(title, summary, articleUrl, author, publishedDate);
    
    let result;
    
    if (mainImageUrl) {
      // Send photo with caption if image is available
      result = await sendTelegramPhoto(chatId, mainImageUrl, messageText, {
        parseMode: 'HTML',
        disableNotification: false
      });
    } else {
      // Send text message if no image
      result = await sendTelegramMessage(chatId, messageText, {
        parseMode: 'HTML',
        disableWebPagePreview: false
      });
    }
    
    return {
      success: true,
      message: 'Article posted to Telegram successfully',
      telegramResponse: result,
      articleInfo: {
        title,
        summary,
        articleUrl,
        mainImageUrl,
        author,
        publishedDate
      }
    };
    
  } catch (error) {
    console.error('Error posting TheGlobe article to Telegram:', error);
    throw new Error(`Failed to post article to Telegram: ${error.message}`);
  }
}

function formatArticleMessage(title, summary, articleUrl, author, publishedDate) {
  const formattedDate = new Date(publishedDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  return `
🌍 <b>TheGlobe News</b>

<b>${title}</b>

${summary}

👤 By: ${author}
📅 ${formattedDate}

<a href="${articleUrl}">Read Full Article</a>
  `.trim();
}

async function postTheGlobeArticleUpdate(neonModel) {
  try {
    console.log('Posting TheGlobe article update to Telegram');
    
    const modelData = neonModel.model?.data || neonModel.data || neonModel;
    const title = modelData.title || "Updated Article";
    const summary = modelData.summary || "Article has been updated";
    const articleUrl = modelData.url || "#";
    
    const chatId = process.env.TELEGRAM_THEGLOBE_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
    
    if (!chatId) {
      throw new Error('Telegram chat ID not configured');
    }
    
    const messageText = `
🔄 <b>Article Updated - TheGlobe</b>

<b>${title}</b>

${summary}

<a href="${articleUrl}">Read Updated Article</a>
    `.trim();
    
    const result = await sendTelegramMessage(chatId, messageText, {
      parseMode: 'HTML',
      disableWebPagePreview: false
    });
    
    return {
      success: true,  
      message: 'Article update posted to Telegram successfully',
      telegramResponse: result
    };
    
  } catch (error) {
    console.error('Error posting article update to Telegram:', error);
    throw new Error(`Failed to post article update to Telegram: ${error.message}`);
  }
}

async function sendTestTelegramMessage() {
  const testMessage = `
🧪 <b>Test Message - TheGlobe Integration</b>

This is a test message from the Neon-Telegram integration.

📱 Integration Status: Active
⏰ Sent at: ${new Date().toLocaleString()}
  `.trim();
  
  const chatId = process.env.TELEGRAM_THEGLOBE_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
  
  if (!chatId) {
    throw new Error('Telegram chat ID not configured for testing');
  }
  
  return await sendTelegramMessage(chatId, testMessage, {
    parseMode: 'HTML'
  });
}

module.exports = {
  sendTelegramMessage,
  sendTelegramPhoto,
  postTheGlobeArticleToTelegram,
  postTheGlobeArticleUpdate,
  sendTestTelegramMessage,
  formatArticleMessage
};