// create.js
import { db } from './firebase-config.js';
import { doc, getDoc, setDoc, onSnapshot, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-firestore.js";

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

        // Enable start button when at least one player joins
        if (Object.keys(players).length > 0 && gameData.gameState === 'waiting') {
            startGameBtn.disabled = false;
        } else {
            startGameBtn.disabled = true;
        }

        if (gameData.gameState === 'finished') {
            showFinalResults(players);
        }
    });
}

function updateTeamList(playerNames) {
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
    
    await updateDoc(gameDocRef, {
        gameState: 'running',
        gameStartTime: serverTimestamp(),
        gameLengthMinutes: parseInt(gameLength, 10),
        questionTypes: questionTypes
    });

    startTimer(parseInt(gameLength, 10));
    // The host now ONLY generates the very first question.
    generateNewQuestion(); 
}

function startTimer(minutes) {
    let seconds = minutes * 60;
    const timerInterval = setInterval(async () => {
        seconds--;
        const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
        const secs = (seconds % 60).toString().padStart(2, '0');
        timerDisplay.textContent = `${mins}:${secs}`;

        if (seconds <= 0) {
            clearInterval(timerInterval);
            clearInterval(gameUpdateInterval); // Stop generating new questions
            await updateDoc(gameDocRef, { gameState: 'finished' });
            if (unsubscribeFromPlayers) unsubscribeFromPlayers();
        }
    }, 1000);
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


// --- Question Generation ---
async function generateNewQuestion() {
    // We get a fresh reference to the doc each time
    const gameDocRef = doc(db, 'games', gameCode); 
    const docSnap = await getDoc(gameDocRef);
    const gameData = docSnap.data();

    if (gameData.gameState !== 'running') return;

    const enabledTypes = Object.keys(gameData.questionTypes).filter(k => gameData.questionTypes[k]);
    if (enabledTypes.length === 0) return;

    const type = enabledTypes[Math.floor(Math.random() * enabledTypes.length)];
    const question = createQuestion(type);
    
    // This simply updates the question for all players to see.
    await updateDoc(gameDocRef, {
        currentQuestion: {
            ...question,
            id: Date.now()
        }
    });
}

    // NEW: Instead of an interval, we wait a longer time then generate the next question.
    // This creates a chain, but doesn't rely on player answers, keeping everyone in sync.
    // You can change this value (in milliseconds) to make the time per question longer or shorter.
    const timePerQuestion = 15000; // 15 seconds
    gameUpdateInterval = setTimeout(generateNewQuestion, timePerQuestion);


function createQuestion(type) {
    let a, b, c;
    const operator = type.includes('_x_') ? '×' : '÷';

    // Generate 'a' based on type
    if (type.startsWith('w_')) {
        a = Math.floor(Math.random() * 90) + 10;
    } else if (type.startsWith('d1_')) {
        a = parseFloat(((Math.random() * 9) + 1).toFixed(1));
    } else { // 2dp
        a = parseFloat(((Math.random() * 90) + 1).toFixed(2));
    }

    // Generate 'b' based on type
    if (type.includes('10_100')) {
        b = Math.random() < 0.5 ? 10 : 100;
    } else if (type.includes('_10')) {
        b = 10;
    } else {
        b = 100;
    }

    // Calculate 'c'
    c = operator === '×' ? a * b : a / b;
    c = parseFloat(c.toPrecision(15));

    // Decide which part is missing
    const missingPart = Math.floor(Math.random() * 3);
    let problem, answer;

    if (missingPart === 0) { // a is missing
        problem = `? ${operator} ${b} = ${c}`;
        answer = a;
    } else if (missingPart === 1) { // b is missing
        problem = `${a} ${operator} ? = ${c}`;
        answer = b;
    } else { // c is missing
        problem = `${a} ${operator} ${b} = ?`;
        answer = c;
    }

    const options = generateDistractors(answer, missingPart === 1);
    return { problem, options, answer };
}

function generateDistractors(correctAnswer, isPowerOf10) {
    let distractors = new Set([correctAnswer]);
    const multipliers = [10, 100, 0.1, 0.01];
    const powerOf10Options = [10, 100, 1000, 0.1, 0.01];

    if (isPowerOf10) {
        while (distractors.size < 4) {
            const randomPower = powerOf10Options[Math.floor(Math.random() * powerOf10Options.length)];
            distractors.add(randomPower);
        }
    } else {
        // Add distractors with the same digits but wrong place value
        for (const m of multipliers) {
            if (distractors.size < 4) {
                distractors.add(parseFloat((correctAnswer * m).toPrecision(15)));
            }
        }
        // If we still don't have enough, add some random variations
        while (distractors.size < 4) {
             distractors.add(parseFloat((correctAnswer / (multipliers[distractors.size-1] * 10)).toPrecision(15)));
        }
    }

    return Array.from(distractors).sort(() => Math.random() - 0.5);
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
