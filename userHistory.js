// Singleton class for userHistory
class userHistory {
  constructor() {
    console.log("Singleton constructor called"); // Confirm Bolt/Express both using singleton
    
    // Initialize userHistory if it's not already initialized
    if (!userHistory.onlyInstance) {
      this.userHistory = {};   // This is just a template
      userHistory.onlyInstance = this;
    }
    // Return the single instance of UserHistory
    return userHistory.onlyInstance;
  }

    // Method to update a user's history
    updateUserHistory(userId, message) {
      console.log("Updating user history (singleton method)") // Debugging line
      if (!this.userHistory[userId]) {
        this.userHistory[userId] = [];
      }
      this.userHistory[userId].push({ role: "user", content: message });
  }

    // Method to get the entire userHistory
      getUserHistory() {
      return this.userHistory;
  }

    // Method to get a specific user's history
      getUserHistoryById(userId) {
      return this.userHistory[userId] || [];
      }
  }

// Create an actual single instance of UserHistory. The class
// blueprint above says this.userHistory (instance) will be set to {}. 
const userHistoryOnlyInstance = new userHistory(); 

// Export the instance.  
export default userHistoryOnlyInstance;  