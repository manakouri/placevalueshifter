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

// --- Initialization ---
function init() {
    const params = new URLSearchParams(window.location.search);
    gameCode = params.get('code');
    teamName = params.get('team');

    if (!gameCode || !teamName) {
        window.location.href = 'index.html'; // Redirect if no params
        return;
    }

    teamNameDisplay.textContent = teamName;
    gameDocRef = doc(db, 'games', gameCode);
    listenForGameChanges();
}

// --- Realtime Listener ---
function listenForGameChanges() {
    onSnapshot(gameDocRef, (doc) => {
        const gameData = doc.data();
        if (!gameData) return;

        // Update score display
        if (gameData.players && gameData.players[teamName]) {
            scoreDisplay.textContent = `Score: ${gameData.players[teamName].score}`;
        }

        // Handle game state changes
        switch (gameData.gameState) {
            case 'running':
                if (waitingArea.style.display !== 'none') {
                    startGame(gameData.gameStartTime.toMillis(), gameData.gameLengthMinutes);
                }
                displayNewQuestion(gameData.currentQuestion);
                break;
            case 'finished':
                endGame(gameData.players[teamName]);
                break;
        }
    });
}

function startGame(startTime, lengthMinutes) {
    waitingArea.classList.add('hidden');
    questionArea.classList.remove('hidden');
    startTimer(startTime, lengthMinutes);
}

function displayNewQuestion(question) {
    if (!question || question.id === currentQuestionId) {
        return; // Same question, do nothing
    }
    
    currentQuestionId = question.id;
    questionPrompt.textContent = question.problem;
    
    // 1. Hide the options grid immediately
    const optionsGrid = document.querySelector('.options-grid');
    optionsGrid.classList.add('hidden');

    // 2. Clear previous button text and state
    optionButtons.forEach(btn => {
        btn.textContent = '';
        btn.disabled = true;
        btn.className = 'btn option'; // Reset colors
    });

    // 3. Set a timeout to reveal the options after 4 seconds
    setTimeout(() => {
        optionButtons.forEach((btn, index) => {
            btn.textContent = question.options[index];
            btn.dataset.answer = question.options[index];
            btn.disabled = false; // Enable buttons now
        });
        optionsGrid.classList.remove('hidden'); // Show the grid
        canAnswer = true;
    }, 4000); // 4000 milliseconds = 4 seconds
}

async function handleAnswer(e) {
    if (!canAnswer) return;
    canAnswer = false;

    const selectedAnswer = parseFloat(e.target.dataset.answer);
    const gameDoc = await getDoc(gameDocRef);
    const correctAnswer = gameDoc.data().currentQuestion.answer;
    
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

    // After a short delay to show feedback, check for secret box or get a new question
    setTimeout(() => {
        if (correctStreak >= nextBoxRequirement) {
            correctStreak = 0;
            nextBoxRequirement = Math.floor(Math.random() * 4) + 2;
            showSecretBox();
        } else {
            // This is the key change: we trigger a new question from the host
            // Note: This uses a Firebase Cloud Function for security in a real app, 
            // but for this project we'll call the host's logic directly.
            // This will create a new question for ALL players.
            window.parent.generateNewQuestion(); // A simplified way to call the host's function
        }
    }, 1500); // 1.5 second delay before next action
}

function showSecretBox() {
    secretBoxModal.classList.remove('hidden');
}

async function handleSecretBoxChoice(e) {
    const clickedBox = e.currentTarget; // Use currentTarget to get the div
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
    
    // 1. Reveal the prize in the span
    prizeSpan.textContent = effectText;
    prizeSpan.classList.add('revealed');
    emojiSpan.style.transform = 'scale(1.2)'; // Make the chosen box pop

    // (Score calculation logic remains the same...)
    const gameDoc = await getDoc(gameDocRef);
    const currentScore = gameDoc.data().players[teamName].score;
    let newScore = currentScore;

    if (chosenEffectKey === '+250') newScore += 250;
    else if (chosenEffectKey === '*2') newScore *= 2;
    else if (chosenEffectKey === '*0.5') newScore = Math.round(newScore / 2);
    else if (chosenEffectKey === '*3') newScore *= 3;
    
    await updateDoc(gameDocRef, { [`players.${teamName}.score`]: newScore });

    // 2. Wait before hiding the modal and resetting
    setTimeout(() => {
        secretBoxModal.classList.add('hidden');

        // 3. Reset all boxes for the next time
        secretBoxes.forEach(box => {
            box.querySelector('.box-prize').classList.remove('revealed');
            box.querySelector('.box-prize').textContent = '';
            box.querySelector('.box-emoji').style.transform = 'scale(1)';
            box.style.pointerEvents = 'auto';
        });
        
        // After the box is chosen, immediately get the next question for everyone.
        window.parent.generateNewQuestion();
    }, 2500); 
}


function startTimer(startTimeMillis, lengthMinutes) {
    const endTime = startTimeMillis + lengthMinutes * 60 * 1000;

    timerInterval = setInterval(() => {
        const remaining = endTime - Date.now();
        if (remaining <= 0) {
            clearInterval(timerInterval);
            gameTimerDisplay.textContent = '00:00';
            return;
        }
        const mins = Math.floor(remaining / 60000).toString().padStart(2, '0');
        const secs = Math.floor((remaining % 60000) / 1000).toString().padStart(2, '0');
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

// --- Event Listeners ---
window.addEventListener('load', init);
optionButtons.forEach(btn => btn.addEventListener('click', handleAnswer));
secretBoxes.forEach(box => box.addEventListener('click', handleSecretBoxChoice));
