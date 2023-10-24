////// ===== CONFIGS & INITS =====

//  Import dependencies
import dotenv from 'dotenv';
import pkg from '@slack/bolt';
import { WebClient } from '@slack/web-api';
import { Configuration, OpenAIApi } from "openai";
import express from "express";

// Load environment variables from .env file, and verify status
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

/* THIS VERSION HARD-CODES THE userHistory OBJECT.  THIS WORKS.
const userHistory = {
  "testUser1": [
    { role: "user", content: "Test Message 1" },
    { role: "bot", content: "Test Reply 1" }
  ],
  "testUser2": [
    { role: "user", content: "Test Message 2" },
    { role: "bot", content: "Test Reply 2" }
  ]
};
*/

// This version leaves the `userHistory` object to be Slack messages pushed to the ojbect by the `userHistory.push()` function (below)  
const userHistory = {}   // "Banana 46" no brackets, {}


// Initialize in-memory store as JavaScript object
let isPaused = false; // Variable to track if the bot is paused
const myMemberID = process.env.MY_MEMBER_ID; // For listeners 
const botMemberID = process.env.BOT_MEMBER_ID; // For listeners

// Initialize Express app
const expressApp = express();
const port = process.env.PORT2;
if (!port) {
  throw new Error("PORT2 environment variable is not set.");
}

////// ===== EXPRESS ROUTES & MIDDELWARE =====

// Parse JSON requests
expressApp.use(express.json());

/*  COMMENTED OUT TO REDUCE CONSOLE VERBOSITY 
// Log request headers & body for debugging - eg, to debug Slack's url_verification 
expressApp.use((req, res, next) => {
  console.log('Request Headers:', req.headers);
  console.log('Request Body:', req.body);
  next();
});
*/

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

//  Set Expresss endpoint to view userHistory at https://slack2gpt-main2.augierakow.repl.co/userHistory (hard refresh browser)
//  Log userHistory to console 
//  This whole Express function executes only upon GET request, not at launch
//  BUGS: ENDPOINT ONLY SHOWS EMPTY OBJECT '{}', CONSOLE DOESN'T SHOW LOG AT ALL
expressApp.get("/userHistory", (req, res) => {
  try {
    console.log("GET /userHistory route called"); // DEBUGGER
    res.json({userHistory: userHistory }); // 'Banana 91' , userHistory
    console.log('userHistory:', userHistory ); // 'Banana 92' , userHistory
  } catch (error) {
    console.log("Error in GET /userHistory;", error); // DEBUGGER
  }
});

////// ===== APPLICATION LOGIC =====

// Define helper function to fetch responses from OpenAI, with retry
async function fetchOpenAIResponse(userQuery, retryAttempts = 1) {
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

// Define function to send test message to a given channel
const sendTestMessage = async (channelId) => {
  try {
    const result = await web.chat.postMessage({
      text: 'This is a test message', // Is this executing?
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

let userHistoryUpdatePromise = Promise.resolve();  // Initialize a Promise that's immediately resolved

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

    // Check User ID for userHistory object, initialize if none [CORE FUNCITON]
    if (!userHistory[message.user]) userHistory[message.user] = [];

    // Log userHistory BEFORE update [DEBUGGING]
    console.log('Before Update:', JSON.stringify(userHistory));

    // Update the userHistoryUpdatePromise
    userHistoryUpdatePromise = new Promise((resolve, reject) => {      // Promise to update userHistory

    //  Add message to userHistory object [CORE FUNCTION]
    userHistory[message.user].push({ role: "user", content: message.text });  // content: "Banana 208" ,  content: message.text

      // Resolve the Promise indicating the update to userHistory is done
        resolve();
      });

    // Log userHistory AFTER update [DEBUGGING]
    console.log('After Update:', JSON.stringify(userHistory));

    //// --- Message processing (if not skipped) ---

    // Do nothing if paused
    if (isPaused) return;
    if (['@pause', '@resume'].includes(message.text)) return next();

    // Pass message to OpenAI as userQuery 
    const userQuery = message.text;
    const gptResponse = await fetchOpenAIResponse(userQuery);
    await say(`Hello <@${message.user}>, ${gptResponse}`);
  } catch (error) {
    console.error(`Error in main message handler: ${error}`);
  }
});

////// ===== APPLICATION STARTUPS ===== 

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
  console.log(`🚄 Express app is listening on port ${port}!`);
});

// End of program