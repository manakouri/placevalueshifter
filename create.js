// create.js
import { db } from './firebase-config.js';
import { doc, setDoc, onSnapshot, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-firestore.js";

// DOM Elements
const gameCodeDisplay = document.getElementById('game-code-display');
const teamList = document.getElementById('team-list');
const startGameBtn = document.getElementById('start-game-btn');
const timerDisplay = document.getElementById('timer-display');
const leaderboardDiv = document.getElementById('leaderboard');
const finalResultsDiv = document.getElementById('final-results');
const finalLeaderboardDiv = document.getElementById('final-leaderboard');
const gameView = document.getElementById('game-view');

let gameCode;
let gameDocRef;
let unsubscribe; // To stop listening to changes when game ends
let timerInterval;

// --- Game Initialization ---
async function createNewGame() {
    gameCode = Math.random().toString().substring(2, 9);
    gameCodeDisplay.textContent = gameCode;
    gameDocRef = doc(db, 'games', gameCode);

    const questionTypes = getSelectedQuestionTypes();
    const gameLength = document.getElementById('game-length').value;

    try {
        await setDoc(gameDocRef, {
            gameCode: gameCode,
            gameLengthMinutes: parseInt(gameLength, 10),
            questionTypes: questionTypes,
            players: {},
            gameState: 'waiting', // waiting, running, finished
            createdAt: serverTimestamp()
        });
        listenForPlayers();
        gameView.style.display = 'block';
    } catch (e) {
        console.error("Error creating game: ", e);
        alert("Could not create game. Please check console for errors.");
    }
}

// --- Player & Leaderboard Updates ---
function listenForPlayers() {
    unsubscribe = onSnapshot(gameDocRef, (doc) => {
        const gameData = doc.data();
        if (!gameData) return;

        const players = gameData.players || {};
        updateTeamList(Object.keys(players));
        updateLeaderboard(players);

        // Enable start button when at least one player joins
        if (Object.keys(players).length > 0 && gameData.gameState === 'waiting') {
            startGameBtn.disabled = false;
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
    
    // Update game settings in case they were changed after creation
    await updateDoc(gameDocRef, {
        gameState: 'running',
        gameStartTime: serverTimestamp(),
        gameLengthMinutes: parseInt(gameLength, 10),
        questionTypes: questionTypes
    });

    startTimer(parseInt(gameLength, 10));
    generateNewQuestion();
}

function startTimer(minutes) {
    let seconds = minutes * 60;
    timerInterval = setInterval(async () => {
        seconds--;
        const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
        const secs = (seconds % 60).toString().padStart(2, '0');
        timerDisplay.textContent = `${mins}:${secs}`;

        if (seconds <= 0) {
            clearInterval(timerInterval);
            await updateDoc(gameDocRef, { gameState: 'finished' });
            unsubscribe(); // Stop listening for live updates
        }
    }, 1000);
}

function showFinalResults(players) {
    finalResultsDiv.classList.remove('hidden');
    finalLeaderboardDiv.innerHTML = '';
    const sortedPlayers = Object.entries(players).sort((a, b) => b[1].score - a[1].score);

    sortedPlayers.forEach(([name, data]) => {
        const accuracy = data.questionsAnswered > 0 ? ((data.questionsCorrect / data.questionsAnswered) * 100).toFixed(0) : 0;
        const entry = document.createElement('div');
        entry.className = 'leaderboard-entry';
        entry.innerHTML = `
            <span>${name}</span>
            <span>Score: ${data.score}</span>
            <span>Correct: ${data.questionsCorrect}</span>
            <span>Accuracy: ${accuracy}%</span>
        `;
        finalLeaderboardDiv.appendChild(entry);
    });
}


// --- Question Generation ---
async function generateNewQuestion() {
    const gameData = (await getDoc(gameDocRef)).data();
    if (gameData.gameState !== 'running') return;

    const enabledTypes = Object.keys(gameData.questionTypes).filter(k => gameData.questionTypes[k]);
    if (enabledTypes.length === 0) return;

    const type = enabledTypes[Math.floor(Math.random() * enabledTypes.length)];
    const question = createQuestion(type);
    
    await updateDoc(gameDocRef, {
        currentQuestion: {
            ...question,
            id: Date.now() // Unique ID for this question
        }
    });
    
    // Generate next question after a short delay
    setTimeout(generateNewQuestion, 5000); // New question every 5 seconds
}

function createQuestion(type) {
    let a, b, c;
    const operators = ['x', '÷'];
    const powerOf10 = [10, 100, 1000, 0.1, 0.01];
    const operator = type.includes('_x_') ? '×' : '÷';

    // Generate 'a' based on type
    if (type.startsWith('w_')) { // Whole number
        a = Math.floor(Math.random() * 90) + 10; // 10-99
    } else if (type.startsWith('d1_')) { // 1dp
        a = parseFloat(((Math.random() * 9) + 1).toFixed(1));
    } else { // 2dp
        a = parseFloat(((Math.random() * 9) + 1).toFixed(2));
    }

    // Generate 'b' based on type
    if (type.includes('10_100')) {
        b = Math.random() < 0.5 ? 10 : 100;
    } else {
        b = parseInt(type.split('_').pop());
    }

    // Calculate 'c'
    c = operator === '×' ? a * b : a / b;
    c = parseFloat(c.toPrecision(15)); // Handle floating point issues

    // Decide which part is missing (a, b, or c)
    const missingPart = Math.floor(Math.random() * 3); // 0=a, 1=b, 2=c
    let problem, answer;
    let options = [];

    if (missingPart === 0) { // a is missing
        problem = `? ${operator} ${b} = ${c}`;
        answer = a;
        options = generateDistractors(answer, false);
    } else if (missingPart === 1) { // b is missing
        problem = `${a} ${operator} ? = ${c}`;
        answer = b;
        options = generateDistractors(answer, true);
    } else { // c is missing
        problem = `${a} ${operator} ${b} = ?`;
        answer = c;
        options = generateDistractors(answer, false);
    }

    return { problem, options, answer };
}

function generateDistractors(correctAnswer, isPowerOf10) {
    let distractors = new Set([correctAnswer]);
    const multipliers = [10, 100, 0.1, 0.01];
    const powerOf10Options = [10, 100, 1000, 0.1, 0.01];

    if (isPowerOf10) {
        while (distractors.size < 4 && distractors.size < powerOf10Options.length) {
            distractors.add(powerOf10Options[Math.floor(Math.random() * powerOf10Options.length)]);
        }
    } else {
        while (distractors.size < 4) {
            const multiplier = multipliers[Math.floor(Math.random() * multipliers.length)];
            let distractor = correctAnswer * multiplier;
            distractor = parseFloat(distractor.toPrecision(15));
            // Check if it's a completely different number or a duplicate
            if (distractor.toString().replace('.', '').includes(correctAnswer.toString().replace('.', ''))) {
                 distractors.add(distractor);
            }
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
window.addEventListener('load', createNewGame);
startGameBtn.addEventListener('click', startGame);
