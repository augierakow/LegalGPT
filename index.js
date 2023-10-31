////// ===== CONFIGS & INITS =====  TEST FAFO BRANCH

//  Import dependencies
import dotenv from 'dotenv';
import pkg from '@slack/bolt';
import { WebClient } from '@slack/web-api';  // NOT USING?  REMOVE?
import { Configuration, OpenAIApi } from "openai";
import express from "express";
import userHistoryOnlyInstance from "./userHistory.js";

// Load environment variables from .env file, and verify status
dotenv.config();
console.log("Printing Environment Variables:");
console.log("SLACK_SIGNING_SECRET:", process.env.SLACK_SIGNING_SECRET ? "Set" : "Not Set");
console.log("SLACK_BOT_TOKEN:", process.env.SLACK_BOT_TOKEN ? "Set" : "Not Set");
console.log("OPENAI_API_KEY:", process.env.OPENAI_API_KEY ? "Set" : "Not Set");
console.log("PORT1:", process.env.PORT1 ? "Set" : "Not Set");
console.log("PORT2:", process.env.PORT2 ? "Set" : "Not Set");
// add console logs for MY_MEMBER_ID, BOT_MEMBER_ID and TEST_CHANNEL_ID ??

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

// Initialize in-memory store as JavaScript object
let isPaused = false; 
const myMemberID = process.env.MY_MEMBER_ID; // For Slack Bolt message listeners 
const botMemberID = process.env.BOT_MEMBER_ID; // For Slack Bolt message listeners

// Initialize Express app
const expressApp = express();
const port = process.env.PORT2;
if (!port) {
  throw new Error("PORT2 environment variable is not set.");
}

////// ===== EXPRESS MIDDLEWARE & ROUTES =====

//// --- Express Middleware ---

// Parse JSON requests
expressApp.use(express.json());

// Log request headers & body for debugging - eg, to debug Slack's url_verification 
// Uses all incoming HTTP requests
expressApp.use((req, res, next) => {
  console.log('Request Headers:', req.headers);
  console.log('Request Body:', req.body);
  next();
});

//// --- Express Routes ---

// Test OpenAI API query via GET route. 
// First Express endpoint. Executes only on GET request, not at launch. 
// https://slack2gpt-main2.augierakow.repl.co/
expressApp.get("/", async (req, res) => {
  try {
    const response = await fetchOpenAIResponse("Test Query");
    res.send(response);
  } catch (error) {
    console.error("Error details:", error);
    res.status(500).send("An error occurred");
  }
});

//  Second Express endpoint. Executes only on GET request, not at launch. 
//  https://slack2gpt-main2.augierakow.repl.co/userHistory 
//  BUG: ONLY SHOWS `userHistory` UPDATES CREATED BY EXPRESS APP, NOT BOLT APP
expressApp.get("/userHistory", (req, res) => {  
  try {
    console.log("GET /userHistory route called"); 
    res.json({userHistory: userHistoryOnlyInstance.getUserHistory() }); 
    console.log('userHistory:', userHistoryOnlyInstance.getUserHistory() ); 
  } catch (error) {
    console.log("Error in GET /userHistory", error)
  }
});

// Third Express endpoint.  Executes only on GET request, not at launch.
// Load this Express endpoint to update userHistory from within Express app, then reload /userHistory endpoint to see if object is updated with rest info
expressApp.get("/testUserHistory", (req, res) => {
  userHistoryOnlyInstance.updateUserHistory("testUser", { role: "user", content: "Test Message" });
  userHistoryOnlyInstance.updateUserHistory("testUser", { role: "bot", content: "Test Reply xo" });

  res.send("Updated userHistory for testUser.");
}); 

////// ===== APPLICATION LOGIC =====

// Define helper function to fetch responses from OpenAI, with retry
async function fetchOpenAIResponse(userQuery, retryAttempts = 2) {
  let response;
  for (let i = 0; i < retryAttempts; i++) {    // UNDERSTAND BETTER
    try {
      console.log(`Attempt ${i + 1}: Sending query to OpenAI: ${userQuery}`);
      const promptMessage = [
        { role: "user", content: userQuery }
      ];
      response = await openai.createChatCompletion({
        model: "gpt-4",
        messages: promptMessage
      });
      console.log(`Received response from OpenAI: ${response.data.choices[0].message.content}`);
      return response.data.choices[0].message.content;
    } catch (error) {
      console.error(`Attempt ${i + 1} failed: OpenAI API Error:`, error);
      if (i === retryAttempts - 1) {
        return "An error occurred while fetching data from OpenAI after multiple attempts.";
      }
    }
  }
}

//// --- Slack Bot Functions ---

// Define function to send test message to Slack channel
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

//// --- Slack Message Listeners ---

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

// Main Message Handler for Slack messages
boltApp.message(async ({ message, say, next }) => {
  try {

    //// --- Conditional Logic ---

    // Skip if message text is undefined (empty)   
    if (!message.text) {
      console.log('Message text is undefined, skipping.');
      return;
    }

    // Skip if message is from the bot itself
    if (message.user === botMemberID) {
      console.log('Message is from the bot, skipping.');
      return;
    }

    // Skip messages saying "user joined" or "user added"
    if (message.subtype && (message.subtype === 'channel_join' || message.subtype === 'channel_add')) {
      await say(`Welcome <@${message.user}>! Feel free to ask if you have any questions or need assistance.`);  // UNDERSTAND THIS BETTER
      return;
    }

    // Skip messages for Augie
    if (message.text.includes(`<@${myMemberID}>`)) {
      console.log('Message is for Augie, skipping.');
      return;
    }

    // Skip messages from Augie that DON'T include @LegalGPT
    if (message.user === myMemberID) {
      if (!message.text.includes(`<@${botMemberID}>`)) {
        console.log('Message is from Augie without @LegalGPT, skipping.');
        return;
      } else {
        console.log('Message is from Augie with @LegalGPT, processing.');
      }
    }

    //  Log sender and message -- ONLY IF survived all conditional logic
    console.log(`User ${message.user} sent message: ${message.text}`);

    //// --- userHistory ---

    // Log userHistory BEFORE update 
    console.log('Before Update:', JSON.stringify(userHistoryOnlyInstance)); 

    // Check User ID for userHistory object, initialize if none
    userHistoryOnlyInstance.updateUserHistory(message.user, { role: "user", content: message.text });

    // Log userHistory AFTER update 
    console.log('After Update:', JSON.stringify(userHistoryOnlyInstance));

    //// --- Message processing (unskipped messages only) ---

    // Do nothing if paused
    if (isPaused) return;
    if (/(@pause|@resume)/.test(message.text)) return next(); // No middleware or listeners for next() to pass control too.  // UPDATE THIS LINE IN MAIN BRANCH TOO!!

    // Pass message to OpenAI as userQuery 
    const userQuery = message.text;
    const gptResponse = await fetchOpenAIResponse(userQuery);
    await say(`Hello <@${message.user}>, ${gptResponse}`);
  } catch (error) {
    console.error(`Error in main message handler: ${error}`);
  }
});

////// ===== START APPLICATIONS ===== 

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
sendTestMessage(process.env.TEST_CHANNEL_ID);  // ADD ERROR HANDLING?

// Start Express app
expressApp.listen(port, () => {
  console.log(`🚄 Express app is listening on port ${port}!`);
});

// End of program