// create.js
import { db, auth } from './firebase-config.js'; // <-- Make sure auth is imported
import { doc, getDoc, setDoc, onSnapshot, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-firestore.js";
import { signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-auth.js"; // <-- Add new imports

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
let gameUpdateInterval;
let gameDataForDownload = {};

/**
 * Main function to set up the game on page load.
 * It generates a code, displays it immediately, and then
 * validates and creates the game in the database.
 */
async function setupGame() {
    // 1. Generate and display a code immediately for the user.
    const initialCode = Math.floor(1000000 + Math.random() * 9000000).toString();
    gameCodeDisplay.textContent = initialCode;

    // 2. Start the process of validating the code and creating the game.
    await validateAndCreateGame(initialCode);
}

/**
 * Checks if a game code is unique. If it is, creates the game.
 * If not, generates a new code and repeats the process.
 * @param {string} codeToValidate The game code to check.
 */
async function validateAndCreateGame(codeToValidate) {
    const potentialDocRef = doc(db, 'games', codeToValidate);
    
    try {
        const docSnap = await getDoc(potentialDocRef);

        if (docSnap.exists()) {
            // If code is taken, generate a new one, display it, and try again.
            console.warn(`Code ${codeToValidate} exists. Generating a new one.`);
            const newCode = Math.floor(1000000 + Math.random() * 9000000).toString();
            gameCodeDisplay.textContent = newCode;
            await validateAndCreateGame(newCode); // Recursive call with the new code
        } else {
            // The code is unique and available. Let's create the game.
            gameCode = codeToValidate;
            gameDocRef = potentialDocRef;
            
            const questionTypes = getSelectedQuestionTypes();
            const gameLength = document.getElementById('game-length').value;

            await setDoc(gameDocRef, {
                gameCode: gameCode,
                gameLengthMinutes: parseInt(gameLength, 10),
                questionTypes: questionTypes,
                players: {},
                gameState: 'waiting', // waiting, running, finished
                createdAt: serverTimestamp()
            });

            // Now that the game is created, start listening for players.
            listenForPlayers();
        }
    } catch (error) {
        console.error("Firebase Error: Could not validate or create game.", error);
        gameCodeDisplay.textContent = "ERROR";
        alert("Could not connect to the server to create a game. Please check your internet connection and refresh the page.");
    }
}

// Add this new function to handle signing in
function signInPlayerAnonymously() {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      // User is already signed in.
      console.log("User is signed in with uid:", user.uid);
    } else {
      // User is not signed in. Sign them in anonymously.
      signInAnonymously(auth).catch((error) => {
        console.error("Anonymous sign-in failed:", error);
      });
    }
  });
}

// Call the function as soon as the script loads
signInPlayerAnonymously();
// --- Player & Leaderboard Updates ---
function listenForPlayers() {
    unsubscribeFromPlayers = onSnapshot(gameDocRef, (doc) => {
        const gameData = doc.data();
        if (!gameData) return;

        const players = gameData.players || {};
        updateTeamList(Object.keys(players));
        
        if (gameData.gameState !== 'waiting') {
            updateLeaderboard(players);
        }
        
        if (Object.keys(players).length > 0 && gameData.gameState === 'waiting') {
            startGameBtn.disabled = false;
        } else {
            startGameBtn.disabled = true;
        }

        if (gameData.gameState === 'finished') {
            showFinalResults(players);
        }
        // NOTE: The listener for 'lastQuestionAnsweredAt' has been removed.
    });
}

function updateTeamList(playerNames) {
    const heading = document.getElementById('teams-joined-heading');
    heading.textContent = `Teams Joined (${playerNames.length})`; // Show count in heading
    
    teamList.innerHTML = '';
    if (playerNames.length === 0) {
        teamList.innerHTML = '<li>Waiting for teams to join...</li>';
    } else {
        playerNames.forEach(name => {
            const li = document.createElement('li');
            li.textContent = name;
            teamList.appendChild(li);
        });
    }
}

function updateLeaderboard(players) {
    leaderboardDiv.innerHTML = '';
    const sortedPlayers = Object.entries(players).sort((a, b) => b[1].score - a[1].score);

    sortedPlayers.forEach(([name, data]) => {
        const entry = document.createElement('div');
        entry.className = 'leaderboard-entry';
        entry.innerHTML = `<span>${name}</span><span>${data.score}</span>`;
        leaderboardDiv.appendChild(entry);
    });
}

// --- Game Logic ---
async function startGame() {
    startGameBtn.disabled = true;
    const gameLength = document.getElementById('game-length').value;
    const questionTypes = getSelectedQuestionTypes();
    
    // The host just tells everyone the game has started and when.
    await updateDoc(gameDocRef, {
        gameState: 'running',
        gameStartTime: serverTimestamp(),
        gameLengthMinutes: parseInt(gameLength, 10),
        questionTypes: questionTypes // Players will read this to generate their own questions
    });

    startTimer(parseInt(gameLength, 10));
}

function startTimer(minutes) {
    const gameLengthMillis = minutes * 60 * 1000;

    // We get the official start time from Firebase
    getDoc(gameDocRef).then(docSnap => {
        if (!docSnap.exists() || !docSnap.data().gameStartTime) return;

        const startTimeMillis = docSnap.data().gameStartTime.toMillis();
        const endTime = startTimeMillis + gameLengthMillis;

        const timerInterval = setInterval(async () => {
            const remainingMillis = endTime - Date.now();

            if (remainingMillis <= 0) {
                clearInterval(timerInterval);
                timerDisplay.textContent = '00:00';
                
                // Only the host sets the game state to finished
                const gameDoc = await getDoc(gameDocRef);
                if (gameDoc.exists() && gameDoc.data().gameState !== 'finished') {
                    await updateDoc(gameDocRef, { gameState: 'finished' });
                }
                return;
            }

            const remainingSeconds = Math.floor(remainingMillis / 1000);
            const mins = Math.floor(remainingSeconds / 60).toString().padStart(2, '0');
            const secs = (remainingSeconds % 60).toString().padStart(2, '0');
            timerDisplay.textContent = `${mins}:${secs}`;
        }, 1000);
    });
}

function showFinalResults(players) {
    finalResultsDiv.classList.remove('hidden');
    leaderboardDiv.classList.add('hidden'); // Hide live leaderboard
    finalLeaderboardDiv.innerHTML = '<h3>Final Scores</h3>';
    const sortedPlayers = Object.entries(players).sort((a, b) => b[1].score - a[1].score);

    sortedPlayers.forEach(([name, data]) => {
        const accuracy = data.questionsAnswered > 0 ? ((data.questionsCorrect / data.questionsAnswered) * 100).toFixed(0) : 0;
        const entry = document.createElement('div');
        entry.className = 'leaderboard-entry';
        entry.innerHTML = `
            <span><strong>${name}</strong></span>
            <span>${data.score} pts</span>
            <span>${data.questionsCorrect}/${data.questionsAnswered} (${accuracy}%)</span>
        `;
        finalLeaderboardDiv.appendChild(entry);
    });
}


function getSelectedQuestionTypes() {
    const checkboxes = document.querySelectorAll('input[name="q-type"]');
    const types = {};
    checkboxes.forEach(cb => {
        types[cb.value] = cb.checked;
    });
    return types;
}

// --- Event Listeners ---
window.addEventListener('load', setupGame);
startGameBtn.addEventListener('click', startGame);
