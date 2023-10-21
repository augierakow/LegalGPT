////// ==================== CONFIGS & INITS ====================

//  Import dependencies
import express from "express";
import { Configuration, OpenAIApi } from "openai";
import pkg from '@slack/bolt';
import dotenv from 'dotenv';
import { WebClient } from '@slack/web-api';

// Load environment variables from .env file and verify status
dotenv.config();
console.log("Printing Environment Variables:");
console.log("SLACK_SIGNING_SECRET:", process.env.SLACK_SIGNING_SECRET ? "Set" : "Not Set");
console.log("SLACK_BOT_TOKEN:", process.env.SLACK_BOT_TOKEN ? "Set" : "Not Set");
console.log("OPENAI_API_KEY:", process.env.OPENAI_API_KEY ? "Set" : "Not Set");
console.log("PORT1:", process.env.PORT1 ? "Set" : "Not Set");
console.log("PORT2:", process.env.PORT2 ? "Set" : "Not Set");

// Initialize OpenAI API connection 
const openai = new OpenAIApi(new Configuration({ apiKey: process.env.OPENAI_API_KEY }));

// Initialize Slack bot using Bolt framework 
const { App } = pkg;
const signingSecret = process.env.SLACK_SIGNING_SECRET;
const botToken = process.env.SLACK_BOT_TOKEN;
const boltApp = new App({
  signingSecret: signingSecret,
  token: botToken
});
const web = new WebClient(process.env.SLACK_BOT_TOKEN);
const userHistories = {}; // Initialize in-memory store as JavaScript object
let isPaused = false; // Variable to track if the bot is paused
const myMemberID = process.env.MY_MEMBER_ID; // For listeners 
const botMemberID = process.env.BOT_MEMBER_ID; // For listeners
 
// Initialize Express app & middleware
const expressApp = express();
const port = process.env.PORT2;
if (!port) {
  throw new Error("PORT2 environment variable is not set.");
}
expressApp.use(express.json()); // Parse JSON requests 

////// ==================== EXPRESS ROUTES & MIDDELWARE ====================

// Log request headers & body for debugging - eg, to debug Slack's url_verification
expressApp.use((req, res, next) => { 
  console.log('Request Headers:', req.headers);
  console.log('Request Body:', req.body);
  next();
});

// Test OpenAI API query via GET route 
expressApp.get("/", async (req, res) => {
  try {
    const response = await fetchOpenAIResponse("Test Query");
    res.send(response);
  } catch (error) {
    console.error("Error details:", error);
    res.status(500).send("An error occurred");
  }
});

//  Set endpoint for viewing userHistories
expressApp.get("/debug", (req, res) => { // https://slack2gpt-main2.augierakow.repl.co/debug 
 console.log(userHistories);   // Log userHistories object content to console
  res.json(userHistories);   // Send userHistories object itself to browser 
});

////// ==================== APPLICATION LOGIC ====================

// Define helper function to fetch responses from OpenAI
async function fetchOpenAIResponse(userQuery) {
  try {
    console.log(`Sending query to OpenAI: ${userQuery}`);
    const promptMessage = [
      { role: "user", content: userQuery }
    ];
    const response = await openai.createChatCompletion({
      model: "gpt-4",
      messages: promptMessage
    });
    console.log(`Received response from OpenAI: ${response.data.choices[0].message.content}`);
    return response.data.choices[0].message.content;
  } catch (error) {
    console.error("OpenAI API Error:", error);
    return "An error occurred while fetching data from OpenAI";
  }
}

//// -------- Slack Bot Functions --------

// Function to send test message to a given channel
const sendTestMessage = async (channelId) => {
  try {
    const result = await web.chat.postMessage({
      text: 'This is a test message',
      channel: channelId,
    });

    console.log(`Message sent: ${result.ts}`);
  } catch (error) {
    console.error(`Error sending message: ${error}`);
  }
};

//// -------- Slack Message Listeners --------

// Listen for "@pause"
boltApp.message(/@pause/, async ({ say }) => {
  isPaused = true;
  await say("The bot is now paused.");
  return;
});

// Listen for "@resume"
boltApp.message(/@resume/, async ({ say }) => {
  isPaused = false;
  await say("The bot is now resumed.");
  return;
});

// Main Message Handler for Slack Messages
boltApp.message(async ({ message, say, next }) => {
  try {
    // Skip if message is undefined   
    if (!message.text) {
      console.log('Message text is undefined, skipping.');
      return;
    }
  
    // Skip if message is from the bot itself
    if (message.user === botMemberID) {
      console.log('Message is from the bot, skipping.');
      return;
    }
  
    // Skip messages for Augie (using backticks for template literals)
    if (message.text.includes(`<@${myMemberID}>`)) {
      console.log('Message is for Augie, skipping.');
      return;
    }
  
    // Skip messages from Augie if they don't include @LegalGPT (using backticks)
    if (message.user === myMemberID) {
      if (!message.text.includes(`<@${botMemberID}>`)) {
        console.log('Message is from Augie without @LegalGPT, skipping.');
        return;
      } else {
        console.log('Message is from Augie with @LegalGPT, processing.');
      }
    }
  
    // Skip messages saying users joined or were added
    if (message.subtype && (message.subtype === 'channel_join' || message.subtype === 'channel_add')) {
      await say(`Welcome <@${message.user}>! Feel free to ask if you have any questions or need assistance.`);
      return;
    }
  
    // Check User ID for userHistories object.    
    if (!userHistories[message.user]) userHistories[message.user] = [];
    //  Add message to userHistories object. Two-property array: role ("user"), content (message text) 
    userHistories[message.user].push({ role: "user", content: message.text });
    //  Log content of userHistories  
    console.log('Updated userHistories:', userHistories);  // FAILS TO LOG UPDATED USER HISTORIES
  
    //  Log details of userHistories update message handling 
    console.log(`User ${message.user} sent message: ${message.text}`);  // NEED TO TEST THIS
  
    // Log received message. 
    console.log(`Received message: ${message.text}`)
  
    // Do nothing if paused
    if (isPaused) return;
    if (['@pause', '@resume'].includes(message.text)) return next();
    const userQuery = message.text;
    const gptResponse = await fetchOpenAIResponse(userQuery);
    await say(`Hello <@${message.user}>, ${gptResponse}`);
  } catch (error) {
  console.error(`Error in main message handler: ${error}`);
  }
});

////// ==================== APPLICATION STARTUPS ==================== 

// Start Bolt app  
(async () => {
  const boltPort = process.env.PORT1;
  if (!boltPort) {
    throw new Error("PORT1 environment variable is not set.");
  }
  await boltApp.start(boltPort);
  console.log(`⚡️ Bolt app is running on port ${boltPort}!`);
})();

// Send test message to #legalgpt-test channel
sendTestMessage(process.env.TEST_CHANNEL_ID);

// Start Express app

expressApp.listen(port, () => {
  console.log(`Listening at http://localhost:${port}`);
});

// End of program