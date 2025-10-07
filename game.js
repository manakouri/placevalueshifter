// game.js
import { db } from './firebase-config.js';
import { doc, onSnapshot, updateDoc, increment, getDoc } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-firestore.js";

// DOM Elements
const teamNameDisplay = document.getElementById('team-name-display');
const scoreDisplay = document.getElementById('score-display');
const gameTimerDisplay = document.getElementById('game-timer');
const waitingArea = document.getElementById('waiting-area');
const questionArea = document.getElementById('question-area');
const postGameArea = document.getElementById('post-game-area');
const questionPrompt = document.getElementById('question-prompt');
const optionButtons = document.querySelectorAll('.option');
const finalStats = document.getElementById('final-stats');
const secretBoxModal = document.getElementById('secret-box-modal');
const secretBoxes = document.querySelectorAll('.secret-box');

// --- Game State Variables ---
let gameCode, teamName;
let gameDocRef;
let currentQuestionId = null;
let canAnswer = false;
let correctStreak = 0;
let nextBoxRequirement = Math.floor(Math.random() * 4) + 2; // 2-5
let timerInterval;
let gameSettings = {}; // NEW: To store question types locally
let gameHasStarted = false;

// --- Initialization ---
async function init() {
    const params = new URLSearchParams(window.location.search);
    gameCode = params.get('code');
    teamName = params.get('team');

    if (!gameCode || !teamName) {
        window.location.href = 'index.html';
        return;
    }

     teamNameDisplay.textContent = teamName;
    renderPlaceValueTable(); // NEW: Call the function here

    gameDocRef = doc(db, 'games', gameCode);
    
    // NEW: Fetch the game settings once at the start
    const gameDoc = await getDoc(gameDocRef);
    if(gameDoc.exists()) {
        gameSettings = gameDoc.data();
    }

    listenForGameChanges();
}

// --- Realtime Listener ---
function listenForGameChanges() {
    onSnapshot(gameDocRef, (doc) => {
        const gameData = doc.data();
        if (!gameData) return;

        if (gameData.players && gameData.players[teamName]) {
            scoreDisplay.textContent = `Score: ${gameData.players[teamName].score}`;
        }

        // Check if the game is running AND we haven't started the game locally yet
        if (gameData.gameState === 'running' && !gameHasStarted) {
            gameHasStarted = true; // Set the flag so this only runs once
            startGame(gameData.gameStartTime.toMillis(), gameData.gameLengthMinutes);
        } 
        else if (gameData.gameState === 'finished') {
            endGame(gameData.players[teamName]);
        }
    });
}

function startGame(startTime, lengthMinutes) {
    waitingArea.classList.add('hidden');
    questionArea.classList.remove('hidden');
    startTimer(startTime, lengthMinutes);
    displayNewQuestion(); // This is the single, correct call.
}

function displayNewQuestion() {
    // Generate a question using the settings we fetched
    const question = createQuestion(gameSettings.questionTypes);
    if (!question) return; // Stop if no question types are enabled

    currentQuestionId = Date.now(); // Simple unique ID
    questionPrompt.textContent = question.problem;
    
    const optionsGrid = document.querySelector('.options-grid');
    optionsGrid.classList.add('hidden');

    optionButtons.forEach(btn => {
        btn.textContent = '';
        btn.disabled = true;
        btn.className = 'btn option';
    });

    setTimeout(() => {
        optionButtons.forEach((btn, index) => {
            btn.textContent = question.options[index];
            btn.dataset.answer = question.options[index];
            btn.dataset.correct = question.answer; // Store correct answer on the button
            btn.disabled = false;
        });
        optionsGrid.classList.remove('hidden');
        canAnswer = true;
    }, 4000);
}

async function handleAnswer(e) {
    if (!canAnswer) return;
    canAnswer = false;

    const selectedAnswer = parseFloat(e.target.dataset.answer);
    const correctAnswer = parseFloat(e.target.dataset.correct);
    
    const isCorrect = selectedAnswer === correctAnswer;

    e.target.classList.add(isCorrect ? 'correct' : 'incorrect');
    optionButtons.forEach(btn => btn.disabled = true);

    const playerUpdate = {
        [`players.${teamName}.questionsAnswered`]: increment(1)
    };
    
    if (isCorrect) {
        playerUpdate[`players.${teamName}.score`] = increment(100);
        playerUpdate[`players.${teamName}.questionsCorrect`] = increment(1);
        correctStreak++;
    } else {
        correctStreak = 0;
    }
    
    await updateDoc(gameDocRef, playerUpdate);

    setTimeout(() => {
        if (correctStreak >= nextBoxRequirement) {
            correctStreak = 0;
            nextBoxRequirement = Math.floor(Math.random() * 4) + 2;
            showSecretBox();
        } else {
            displayNewQuestion(); // Directly generate the next question
        }
    }, 1500);
}


function showSecretBox() {
    secretBoxModal.classList.remove('hidden');
}

async function handleSecretBoxChoice(e) {
    // ... (The prize reveal and score logic is the same)
    const clickedBox = e.currentTarget;
    const prizeSpan = clickedBox.querySelector('.box-prize');
    const emojiSpan = clickedBox.querySelector('.box-emoji');
    secretBoxes.forEach(box => box.style.pointerEvents = 'none');
    const effects = {
        '+250': '+250 Points!',
        '*2': 'Score x2!',
        '*0.5': 'Score Halved :(',
        '*3': 'Score x3!!'
    };
    const effectKeys = Object.keys(effects);
    const chosenEffectKey = effectKeys[Math.floor(Math.random() * effectKeys.length)];
    const effectText = effects[chosenEffectKey];
    prizeSpan.textContent = effectText;
    prizeSpan.classList.add('revealed');
    emojiSpan.style.transform = 'scale(1.2)';
    const gameDoc = await getDoc(gameDocRef);
    const currentScore = gameDoc.data().players[teamName].score;
    let newScore = currentScore;
    if (chosenEffectKey === '+250') newScore += 250;
    else if (chosenEffectKey === '*2') newScore *= 2;
    else if (chosenEffectKey === '*0.5') newScore = Math.round(newScore / 2);
    else if (chosenEffectKey === '*3') newScore *= 3;
    await updateDoc(gameDocRef, { [`players.${teamName}.score`]: newScore });

    setTimeout(() => {
        secretBoxModal.classList.add('hidden');
        secretBoxes.forEach(box => {
            box.querySelector('.box-prize').classList.remove('revealed');
            box.querySelector('.box-prize').textContent = '';
            box.querySelector('.box-emoji').style.transform = 'scale(1)';
            box.style.pointerEvents = 'auto';
        });
        
        displayNewQuestion(); // After the box, generate the next question
    }, 2500); 
}

function createQuestion(questionTypes) {
    const enabledTypes = Object.keys(questionTypes).filter(k => questionTypes[k]);
    if (enabledTypes.length === 0) return null;

    const type = enabledTypes[Math.floor(Math.random() * enabledTypes.length)];
    let a, b, c;
    const operator = type.includes('_x_') ? '×' : '÷';

    if (type.startsWith('w_')) {
        a = Math.floor(Math.random() * 90) + 10;
    } else if (type.startsWith('d1_')) {
        a = parseFloat(((Math.random() * 9) + 1).toFixed(1));
    } else {
        a = parseFloat(((Math.random() * 90) + 1).toFixed(2));
    }

    if (type.includes('10_100')) {
        b = Math.random() < 0.5 ? 10 : 100;
    } else if (type.includes('_10')) {
        b = 10;
    } else {
        b = 100;
    }

    c = operator === '×' ? a * b : a / b;
    c = parseFloat(c.toPrecision(15));

    const missingPart = Math.floor(Math.random() * 3);
    let problem, answer;

    if (missingPart === 0) {
        problem = `? ${operator} ${b} = ${c}`;
        answer = a;
    } else if (missingPart === 1) {
        problem = `${a} ${operator} ? = ${c}`;
        answer = b;
    } else {
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
        for (const m of multipliers) {
            if (distractors.size < 4) distractors.add(parseFloat((correctAnswer * m).toPrecision(15)));
        }
        while (distractors.size < 4) {
             distractors.add(parseFloat((correctAnswer / (multipliers[distractors.size-1] * 10)).toPrecision(15)));
        }
    }

    return Array.from(distractors).sort(() => Math.random() - 0.5);
}


function startTimer(startTimeMillis, lengthMinutes) {
    const gameLengthMillis = lengthMinutes * 60 * 1000;
    const endTime = startTimeMillis + gameLengthMillis;

    // Clear any previous timers just in case
    if (timerInterval) clearInterval(timerInterval);

    timerInterval = setInterval(async () => {
        const remainingMillis = endTime - Date.now();

        if (remainingMillis <= 0) {
            clearInterval(timerInterval);
            gameTimerDisplay.textContent = '00:00';

            // NEW: Trigger the end-game sequence
            const gameDoc = await getDoc(gameDocRef);
            if (gameDoc.exists()) {
                endGame(gameDoc.data().players[teamName]);
            }
            return;
        }

        const remainingSeconds = Math.floor(remainingMillis / 1000);
        const mins = Math.floor(remainingSeconds / 60).toString().padStart(2, '0');
        const secs = (remainingSeconds % 60).toString().padStart(2, '0');
        gameTimerDisplay.textContent = `${mins}:${secs}`;
    }, 1000);
}

function endGame(playerData) {
    if (timerInterval) clearInterval(timerInterval);
    questionArea.classList.add('hidden');
    postGameArea.classList.remove('hidden');

    const accuracy = playerData.questionsAnswered > 0 
        ? ((playerData.questionsCorrect / playerData.questionsAnswered) * 100).toFixed(0) 
        : 0;

    finalStats.innerHTML = `
        <strong>Final Score:</strong> ${playerData.score}<br>
        <strong>Questions Correct:</strong> ${playerData.questionsCorrect}<br>
        <strong>Accuracy:</strong> ${accuracy}%
    `;
}

function renderPlaceValueTable() {
    const div = document.getElementById('place-value-table');
    if (!div) return;

    // This creates the HTML for the table and inserts it into the div
    div.innerHTML = `
        <table>
            <tr>
                <th>Thousands</th>
                <th>Hundreds</th>
                <th>Tens</th>
                <th>Ones</th>
                <th>&nbsp;</th>
                <th>Tenths</th>
                <th>Hundredths</th>
                <th>Thousandths</th>
            </tr>
            <tr>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td style="font-size: 2rem; border: none; background: none;">.</td>
                <td></td>
                <td></td>
                <td></td>
            </tr>
        </table>
    `;
}

// --- Event Listeners ---
window.addEventListener('load', init);
optionButtons.forEach(btn => btn.addEventListener('click', handleAnswer));
secretBoxes.forEach(box => box.addEventListener('click', handleSecretBoxChoice));
