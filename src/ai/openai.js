// const { OpenAIApi } = require('openai'); Not compatible with Node 14

const axios = require('axios');
const FormData = require('form-data');

const OPENAI_APIKEY = process.env.OPENAI_APIKEY;

async function completions({
  model = "gpt-4o-mini",
  messages,
  temperature = 0.7
}) {
    console.log(model);
    console.log(temperature);
    console.log(messages);
    console.log(OPENAI_APIKEY);
    
    const data = JSON.stringify({
      model, messages, temperature
    });

    const config = {
        method: 'post',
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        url: `https://api.openai.com/v1/chat/completions`,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_APIKEY}`
        },
        data: data
    };

    return await axios.request(config)
        .then((response) => {
            console.log(JSON.stringify(response.data));
            return response.data;
        })
        .catch((error) => {
            console.error(`❌ ERROR: ${error.code}`);
            console.error(JSON.stringify(error.response.data));
        });
}

/**
 * Transcribes an audio buffer using OpenAI Whisper API.
 * @param {Buffer} audioBuffer - The audio data buffer.
 * @param {string} filename - The name of the audio file (with extension, e.g., 'audio.mp3').
 * @param {string} apiKey - Your OpenAI API key.
 * @returns {Promise<string>} - The transcribed text.
 */
async function transcribeAudio(audioBuffer, filename, apiKey = OPENAI_APIKEY) {
  const form = new FormData();
  form.append('file', audioBuffer, filename);
  form.append('model', 'gpt-4o-transcribe'); // The options are gpt-4o-transcribe, gpt-4o-mini-transcribe, and whisper-1
  //form.append('prompt', 'This is an interview between two people. One asks questions, the other answers. Do not hallucinate.');
  
  try {
    const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${apiKey}`
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    const text = response.data.text;

    // Simple Q&A extraction
    const qna = [];
    const lines = text.split(/\r?\n/);
    let currentQuestion = null;

    for (const line of lines) {
      if (/^Q[:：]/i.test(line)) {
        currentQuestion = line.replace(/^Q[:：]\s*/i, '').trim();
      } else if (/^A[:：]/i.test(line) && currentQuestion) {
        const answer = line.replace(/^A[:：]\s*/i, '').trim();
        qna.push({ question: currentQuestion, answer });
        currentQuestion = null;
      }
    }

    return { qna, rawText: text };
  } catch (error) {
    console.error('Transcription failed:', error.response?.data || error.message);
    throw new Error('Transcription error');
  }
}

/**
 * Converts Q&A into a structured article structure using OpenAI completions.
 * @param {Object[]} qa - Array of Q&A objects from transcription.
 * @param {string} apiKey
 * @returns {Promise<{ headline: string, summary: string, html: string }>}
 */
async function generateInterviewStructure(transcription, apiKey = OPENAI_APIKEY) {
  const qa = transcription.qna;
  
  const prompt = qa.length > 0 ? `
You are given a transcription of an interview in Q&A format. 
Create:
1. A concise, engaging headline.
2. A short summary paragraph (3-4 sentences).
3. A full article body in HTML, using <h3> for questions and <p> for answers.

Q&A:
${qa.map((item, i) => `Q: ${item.question}\nA: ${item.answer}`).join('\n\n')}
` : `
You are given a transcription of an interview in raw text. 
Desume the interview structure, without allucinating. Create:
1. A concise, engaging headline.
2. A short summary paragraph (3-4 sentences).
3. A full article body in HTML, using <h3> for questions and <p> for answers.

Text: ${transcription.rawText}
`;

  try {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are a journalist formatting an interview for publication.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7
    }, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    const content = response.data.choices[0].message.content;

    // Naive parsing — assuming sections are clearly separated
    const headlineMatch = content.match(/headline[:\-]?\s*(.+)/i);
    const summaryMatch = content.match(/summary[:\-]?\s*((.|\n)+?)\n\n/i);
    const htmlMatch = content.match(/<h3>.*<\/p>/is);

    return {
      headline: headlineMatch?.[1]?.trim() || '',
      summary: summaryMatch?.[1]?.trim() || '',
      html: htmlMatch?.[0]?.trim() || ''
    };

  } catch (error) {
    console.error('Completion failed:', error.response?.data || error.message);
    throw new Error('Summary generation error');
  }
}


async function test() {
  return await completions({ "messages": [{"role": "user", "content": "Say this is a test!"}] });
}

module.exports = {
  completions,
  transcribeAudio,
  generateInterviewStructure,
  test
}