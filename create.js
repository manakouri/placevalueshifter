// create.js
import { db, auth } from './firebase-config.js';
import { doc, getDoc, setDoc, onSnapshot, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-firestore.js";
import { signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-auth.js";

// DOM Elements
const gameCodeDisplay = document.getElementById('game-code-display');
const teamList = document.getElementById('team-list');
const startGameBtn = document.getElementById('start-game-btn');
const timerDisplay = document.getElementById('timer-display');
const leaderboardDiv = document.getElementById('leaderboard');
const finalResultsDiv = document.getElementById('final-results');
const finalLeaderboardDiv = document.getElementById('final-leaderboard');

// Global game variables
let gameCode;
let gameDocRef;
let unsubscribeFromPlayers;
let gameDataForDownload = {};

// --- Authentication ---
function signInPlayerAnonymously() {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      console.log("User is signed in with uid:", user.uid);
    } else {
      signInAnonymously(auth).catch((error) => console.error("Anonymous sign-in failed:", error));
    }
  });
}

// --- Game Initialization ---
async function setupGame() {
    const initialCode = Math.floor(1000000 + Math.random() * 9000000).toString();
    gameCodeDisplay.textContent = initialCode;
    await validateAndCreateGame(initialCode);
}

async function validateAndCreateGame(codeToValidate) {
    const potentialDocRef = doc(db, 'games', codeToValidate);
    try {
        const docSnap = await getDoc(potentialDocRef);
        if (docSnap.exists()) {
            const newCode = Math.floor(1000000 + Math.random() * 9000000).toString();
            gameCodeDisplay.textContent = newCode;
            await validateAndCreateGame(newCode);
        } else {
            gameCode = codeToValidate;
            gameDocRef = potentialDocRef;
            const questionTypes = getSelectedQuestionTypes();
            const gameLength = document.getElementById('game-length').value;

            await setDoc(gameDocRef, {
                gameCode: gameCode,
                gameLengthMinutes: parseInt(gameLength, 10),
                questionTypes: questionTypes,
                players: {},
                gameState: 'waiting',
                createdAt: serverTimestamp()
            });

            // This is the crucial call that starts listening for players
            listenForPlayers();
        }
    } catch (error) {
        console.error("Firebase Error:", error);
        gameCodeDisplay.textContent = "ERROR";
        alert("Could not connect to the server. Please refresh the page.");
    }
}

// --- Real-time Listener ---
function listenForPlayers() {
    unsubscribeFromPlayers = onSnapshot(gameDocRef, (doc) => {
        const gameData = doc.data();
        if (!gameData) return;

        const players = gameData.players || {};

        // This function updates the list on the screen
        updateTeamList(Object.keys(players)); 
        
        if (gameData.gameState !== 'waiting') {
            updateLeaderboard(players);
        }
        
        if (Object.keys(players).length > 0 && gameData.gameState === 'waiting') {
            startGameBtn.disabled = false;
        } else if (gameData.gameState === 'waiting') {
            startGameBtn.disabled = true;
        }

        if (gameData.gameState === 'finished') {
            showFinalResults(players
