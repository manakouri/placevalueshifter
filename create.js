// create.js
import { db, auth } from './firebase-config.js';
import { doc, getDoc, setDoc, onSnapshot, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-firestore.js";
import { signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-auth.js";

// --- Global State Variables ---
let gameCode;
let gameDocRef;
let unsubscribeFromPlayers;
let gameDataForDownload = {};
let hostTimerStarted = false;

// --- DOM Element Variables (will be assigned after page loads) ---
let gameCodeDisplay, teamList, startGameBtn, timerDisplay, leaderboardDiv, finalResultsDiv, finalLeaderboardDiv;

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

        updateTeamList(Object.keys(players));
        
        if (gameData.gameState !== 'waiting') {
            updateLeaderboard(players);
        }
        
        if (Object.keys(players).length > 0 && gameData.gameState === 'waiting') {
            startGameBtn.disabled = false;
        } else if (gameData.gameState === 'waiting') {
            startGameBtn.disabled = true;
        }

        // NEW LOGIC: This is where the timer will now start.
        // It waits until the game is running AND the official startTime has arrived.
        if (gameData.gameState === 'running' && !hostTimerStarted && gameData.gameStartTime) {
            hostTimerStarted = true; // Set flag to prevent starting it again
            startTimer(gameData.gameLengthMinutes, gameData.gameStartTime.toMillis());
        }

        if (gameData.gameState === 'finished') {
            showFinalResults(players);
        }
    });
}

// --- UI Update Functions ---
function updateTeamList(playerNames) {
    const heading = document.getElementById('teams-joined-heading');
    heading.textContent = `Teams Joined (${playerNames.length})`;
    
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
    
    // This function now ONLY tells Firebase to start the game.
    // It does NOT try to start the timer itself.
    await updateDoc(gameDocRef, {
        gameState: 'running',
        gameStartTime: serverTimestamp(),
        gameLengthMinutes: parseInt(gameLength, 10),
        questionTypes: questionTypes
    });
}

function startTimer(minutes, startTimeMillis) {
    const gameLengthMillis = minutes * 60 * 1000;
    const endTime = startTimeMillis + gameLengthMillis;

    const timerInterval = setInterval(async () => {
        const remainingMillis = endTime - Date.now();

        if (remainingMillis <= 0) {
            clearInterval(timerInterval);
            timerDisplay.textContent = '00:00';
            
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
}

function showFinalResults(players) {
    gameDataForDownload = players;
    finalResultsDiv.classList.remove('hidden');
    leaderboardDiv.classList.add('hidden');
    finalLeaderboardDiv.innerHTML = '';
    const sortedPlayers = Object.entries(players).sort((a, b) => b[1].score - a[1].score);
    sortedPlayers.forEach(([name, data], index) => {
        const accuracy = data.questionsAnswered > 0 ? ((data.questionsCorrect / data.questionsAnswered) * 100).toFixed(0) : 0;
        const entry = document.createElement('div');
        entry.className = 'leaderboard-entry';
        entry.innerHTML = `
            <span><strong>${index + 1}.</strong> ${name}</span>
            <span>Score: ${data.score}</span>
            <span>Correct: ${data.questionsCorrect}</span>
            <span>Accuracy: ${accuracy}%</span>
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

// --- Download Logic ---
function downloadResults() {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Rank,Team Name,Score,Questions Correct,Questions Answered,Accuracy (%)\r\n";
    const sortedPlayers = Object.entries(gameDataForDownload).sort((a, b) => b[1].score - a[1].score);
    sortedPlayers.forEach(([name, data], index) => {
        const rank = index + 1;
        const accuracy = data.questionsAnswered > 0 ? ((data.questionsCorrect / data.questionsAnswered) * 100).toFixed(0) : 0;
        let row = `${rank},"${name}",${data.score},${data.questionsCorrect},${data.questionsAnswered},${accuracy}`;
        csvContent += row + "\r\n";
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `place-value-shifter-results-${gameCode}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// --- Main Initializer ---
window.addEventListener('DOMContentLoaded', () => {
    // Assign DOM elements now that the page is fully loaded
    gameCodeDisplay = document.getElementById('game-code-display');
    teamList = document.getElementById('team-list');
    startGameBtn = document.getElementById('start-game-btn');
    timerDisplay = document.getElementById('timer-display');
    leaderboardDiv = document.getElementById('leaderboard');
    finalResultsDiv = document.getElementById('final-results');
    finalLeaderboardDiv = document.getElementById('final-leaderboard');
    const downloadBtn = document.getElementById('download-btn');

    // Attach event listeners
    startGameBtn.addEventListener('click', startGame);
    downloadBtn.addEventListener('click', downloadResults);

    // Run startup logic
    signInPlayerAnonymously();
    setupGame();
});
