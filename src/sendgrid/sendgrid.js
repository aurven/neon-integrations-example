const sgMail = require("@sendgrid/mail");

sgMail.setApiKey(process.env.SENDGRID_APIKEY);

async function sendTest() {
  const msg = {
    to: "aureliano.ventrella@gmail.com", // Change to your recipient
    from: "aureliano.ventrella@eidosmedia.com", // Change to your verified sender
    subject: "Sending with SendGrid is Fun",
    text: 'and easy to do anywhere, even with Node.js',
    html: '<strong>and easy to do anywhere, even with Node.js</strong>',
  };
  return sgMail
    .send(msg)
    .then(() => {
      const msg = "Email sent";
      console.log(msg);
    })
    .catch((error) => {
      console.error(error);
    });
}

async function sendWeeklyGlobe() {
  const msg = {
    to: "aureliano.ventrella@gmail.com", // Change to your recipient
    from: "aureliano.ventrella@eidosmedia.com", // Change to your verified sender
    subject: "Your Weekly Globe",
    templateId: "d-f0c49ae378044986a7ab65e3eda7d5e0",
    dynamicTemplateData: {
      first_name: "Aureliano",
      story1_headline: "Story Example",
      story1_summary:
        "This is the summary of my test article. It should be the summary inside the Article",
      story1_url:
        "https://cdn.glitch.global/0abe559b-8f5a-4b00-96f6-ff09b8d8b7f1/Neon.png?v=1738689349660",
      story1_image_url:
        "https://cdn.glitch.global/0abe559b-8f5a-4b00-96f6-ff09b8d8b7f1/Neon.png?v=1738689349660",
      story2_headline: "Story Example",
      story2_summary:
        "This is the summary of my test article. It should be the summary inside the Article",
      story2_url:
        "https://cdn.glitch.global/0abe559b-8f5a-4b00-96f6-ff09b8d8b7f1/Neon.png?v=1738689349660",
      story2_image_url:
        "https://cdn.glitch.global/0abe559b-8f5a-4b00-96f6-ff09b8d8b7f1/Neon.png?v=1738689349660",
      story3_headline: "Story Example",
      story3_summary:
        "This is the summary of my test article. It should be the summary inside the Article",
      story3_url:
        "https://cdn.glitch.global/0abe559b-8f5a-4b00-96f6-ff09b8d8b7f1/Neon.png?v=1738689349660",
      story3_image_url:
        "https://cdn.glitch.global/0abe559b-8f5a-4b00-96f6-ff09b8d8b7f1/Neon.png?v=1738689349660",
      Sender_Name: "Eidosmedia",
      Sender_Address: "Via Carlo Imbonati, 18",
      Sender_City: "Milano",
      Sender_State: "Italia",
      Sender_Zip: "20010",
    },
  };
  return sgMail
    .send(msg)
    .then(() => {
      const msg = "Email sent";
      console.log(msg);
    })
    .catch((error) => {
      console.error(error);
    });
}

module.exports = {
  sendTest,
  sendWeeklyGlobe
};
