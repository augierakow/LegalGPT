import dotenv from 'dotenv';
dotenv.config();

// Log environmental variables 
console.log("Printing Environment Variables:");
console.log("SLACK_SIGNING_SECRET:", process.env.SLACK_SIGNING_SECRET ? "Set" : "Not Set");
console.log("SLACK_BOT_TOKEN:", process.env.SLACK_BOT_TOKEN ? "Set" : "Not Set");
console.log("OPENAI_API_KEY:", process.env.OPENAI_API_KEY ? "Set" : "Not Set");
console.log("PORT1:", process.env.PORT1 ? "Set" : "Not Set");
console.log("PORT2:", process.env.PORT2 ? "Set" : "Not Set");

import express from "express";
import { Configuration, OpenAIApi } from "openai";
import pkg from '@slack/bolt';

const { App } = pkg;

// Slack Configurations
const signingSecret = process.env.SLACK_SIGNING_SECRET;
const botToken = process.env.SLACK_BOT_TOKEN;

// Initialize Slack Bolt App
const boltApp = new App({
  signingSecret: signingSecret,
  token: botToken
});

// Initialize in-memory store as JavaScript object
const userHistories = {};

// Variable to track if the bot is paused
let isPaused = false;

// Listen for Slack messages
const myMemberID = process.env.MY_MEMBER_ID;
const botMemberID = process.env.BOT_MEMBER_ID;

// Message handler checks for certain conditions to ignore or send to OpenAI
boltApp.message(async ({ message, say, next }) => {

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
});

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

// MOVE BOLT AND EXPRESS INITIALIZATION TO TOP?

// Start the Bolt App  
(async () => {
  const boltPort = process.env.PORT1;
  if (!boltPort) {
    throw new Error("PORT1 environment variable is not set.");
  }
  await boltApp.start(boltPort);
  console.log(`⚡️ Bolt app is running on port ${boltPort}!`);
})();

// Initialize Express App
const expressApp = express();
const port = process.env.PORT2;
if (!port) {
  throw new Error("PORT2 environment variable is not set.");
}

// Logs to debug Slack's 'url verification' of Replit endpoint.  MOVE TOWARD TOP?
// Parse JSON request bodies
expressApp.use(express.json());
//Log incoming request headers and body.
expressApp.use((req, res, next) => {
  console.log('Request Headers:', req.headers);
  console.log('Request Body:', req.body);
  next();
});

// Function to fetch OpenAI Response
async function fetchOpenAIResponse(userQuery) {
  try {
    console.log(`Sending query to OpenAI: ${userQuery}`);
    const openai = new OpenAIApi(new Configuration({ apiKey: process.env.OPENAI_API_KEY }));
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

// Express Test Route
expressApp.get("/", async (req, res) => {
  try {
    const response = await fetchOpenAIResponse("Test Query");
    res.send(response);
  } catch (error) {
    console.error("Error details:", error);
    res.status(500).send("An error occurred");
  }
});

// Start the Express App
expressApp.listen(port, () => {
  console.log(`Listening at http://localhost:${port}`);
});

// Create ~/debug endpoint in project directory to log userHistories object (since Replit console isn't showing logs after start and test). View at https://slack2gpt-main2.augierakow.repl.co/debug_ (refresh browser).
expressApp.get("/debug", (req, res) => {
  // Log userHistories object content to console
  console.log(userHistories);
  // Send userHistories object itself to browser
  res.json(userHistories);
  // Send message to browser (doens't mean message is true). COMMENTED OUT TO USE res.json() INSTEAD
  // res.send("Printed userHistories to console");  
});

// Node.js code snippet to manually make bot send a message using Slack API
// Import the WebClient class from the @slack/web-api package
import { WebClient } from '@slack/web-api';

// Initialize a new instance of the WebClient class with your bot token
const web = new WebClient(process.env.SLACK_BOT_TOKEN);

// Define a function to send a test message
const sendTestMessage = async (channelId) => {
  try {
    // Call the chat.postMessage method using the WebClient
    const result = await web.chat.postMessage({
      text: 'This is a test message',
      channel: channelId,
    });

    console.log(`Message sent: ${result.ts}`);
  } catch (error) {
    console.error(`Error sending message: ${error}`);
  }
};

// Send test message to #legalgpt-test channel
sendTestMessage(process.env.TEST_CHANNEL_ID);