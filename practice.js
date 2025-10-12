// practice.js

// --- DOM Element References ---
const highScoreDisplay = document.getElementById('high-score-display');
const scoreDisplay = document.getElementById('score-display');
const gameTimerDisplay = document.getElementById('game-timer');
const questionArea = document.getElementById('question-area');
const postGameArea = document.getElementById('post-game-area');
const questionPrompt = document.getElementById('question-prompt');
const optionButtons = document.querySelectorAll('.option');
const finalStats = document.getElementById('final-stats');
const secretBoxModal = document.getElementById('secret-box-modal');
const secretBoxes = document.querySelectorAll('.secret-box');

// --- Game State Variables ---
let score = 0;
let highScore = 0;
let correctStreak = 0;
let canAnswer = false;
let timerInterval;
let nextBoxRequirement = Math.floor(Math.random() * 3) + 1;

// Define all question types as active for practice mode
const questionTypes = {
    w_x_10_100: true, w_d_10: true, w_d_100: true,
    d1_x_10_100: true, d1_d_10: true, d1_d_100: true,
    d2_x_10_100: true, d2_d_10: true
};

// --- Main Initializer ---
function init() {
    // Load high score from the current browser session
    highScore = sessionStorage.getItem('pvsHighScore') || 0;
    highScoreDisplay.textContent = `High Score: ${highScore}`;

    startTimer(5); // 5-minute timer
    displayNewQuestion();
}

// --- Game Logic ---
function startTimer(minutes) {
    let seconds = minutes * 60;
    timerInterval = setInterval(() => {
        seconds--;
        const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
        const secs = (seconds % 60).toString().padStart(2, '0');
        gameTimerDisplay.textContent = `${mins}:${secs}`;

        if (seconds <= 0) {
            clearInterval(timerInterval);
            endGame();
        }
    }, 1000);
}

function endGame() {
    questionArea.classList.add('hidden');
    postGameArea.classList.remove('hidden');

    finalStats.innerHTML = `
        <strong>Final Score:</strong> ${score}<br>
        <strong>High Score:</strong> ${highScore}
    `;
}

function displayNewQuestion() {
    const question = createQuestion(questionTypes);
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
            btn.dataset.correct = question.answer;
            btn.disabled = false;
        });
        optionsGrid.classList.remove('hidden');
        canAnswer = true;
    }, 2000); // 2-second delay
}

function handleAnswer(e) {
    if (!canAnswer) return;
    canAnswer = false;

    const selectedAnswer = parseFloat(e.target.dataset.answer);
    const correctAnswer = parseFloat(e.target.dataset.correct);
    const isCorrect = selectedAnswer === correctAnswer;

    e.target.classList.add(isCorrect ? 'correct' : 'incorrect');
    optionButtons.forEach(btn => btn.disabled = true);

    if (!isCorrect) {
        optionButtons.forEach(btn => {
            if (parseFloat(btn.dataset.answer) === correctAnswer) {
                btn.classList.add('correct');
            }
        });
    }

    if (isCorrect) {
        score += 100;
        correctStreak++;
        if (score > highScore) {
            highScore = score;
            sessionStorage.setItem('pvsHighScore', highScore); // Save new high score
            highScoreDisplay.textContent = `High Score: ${highScore}`;
        }
        scoreDisplay.textContent = `Score: ${score}`;
    } else {
        correctStreak = 0;
    }

    const delay = isCorrect ? 500 : 2000;
    setTimeout(() => {
        if (isCorrect && correctStreak >= nextBoxRequirement) {
            correctStreak = 0;
            nextBoxRequirement = Math.floor(Math.random() * 3) + 1;
            showSecretBox();
        } else {
            displayNewQuestion();
        }
    }, delay);
}

function showSecretBox() {
    secretBoxModal.classList.remove('hidden');
}

function handleSecretBoxChoice(e) {
    const clickedBox = e.currentTarget;
    secretBoxes.forEach(box => box.style.pointerEvents = 'none');

    const effects = { '+250': '+250', '*2': 'x2', '*0.5': '÷2', '*3': 'x3' };
    const effectKeys = Object.keys(effects);
    const chosenEffectKey = effectKeys[Math.floor(Math.random() * effectKeys.length)];
    
    clickedBox.querySelector('.box-prize').textContent = effects[chosenEffectKey];
    clickedBox.querySelector('.box-prize').classList.add('revealed');
    clickedBox.querySelector('.box-emoji').style.transform = 'scale(1.2)';

    if (chosenEffectKey === '+250') score += 250;
    else if (chosenEffectKey === '*2') score *= 2;
    else if (chosenEffectKey === '*0.5') score = Math.round(score / 2);
    else if (chosenEffectKey === '*3') score *= 3;
    
    scoreDisplay.textContent = `Score: ${score}`;
    if (score > highScore) {
        highScore = score;
        sessionStorage.setItem('pvsHighScore', highScore);
        highScoreDisplay.textContent = `High Score: ${highScore}`;
    }

    setTimeout(() => {
        secretBoxModal.classList.add('hidden');
        secretBoxes.forEach(box => {
            box.querySelector('.box-prize').classList.remove('revealed');
            box.querySelector('.box-prize').textContent = '';
            box.querySelector('.box-emoji').style.transform = 'scale(1)';
            box.style.pointerEvents = 'auto';
        });
        displayNewQuestion();
    }, 2500);
}


// --- Question Generation Logic (Copied from game.js) ---
function createQuestion(qTypes) {
    const enabledTypes = Object.keys(qTypes).filter(k => qTypes[k]);
    if (enabledTypes.length === 0) return null;
    const type = enabledTypes[Math.floor(Math.random() * enabledTypes.length)];
    let a, b, c;
    const operator = type.includes('_x_') ? '×' : '÷';
    if (type.startsWith('w_')) a = Math.floor(Math.random() * 90) + 10;
    else if (type.startsWith('d1_')) a = parseFloat(((Math.random() * 9) + 1).toFixed(1));
    else a = parseFloat(((Math.random() * 90) + 1).toFixed(2));
    if (type.includes('10_100')) b = Math.random() < 0.5 ? 10 : 100;
    else if (type.includes('_10')) b = 10;
    else b = 100;
    c = operator === '×' ? a * b : a / b;
    c = parseFloat(c.toPrecision(15));
    const missingPart = Math.floor(Math.random() * 3);
    let problem, answer;
    if (missingPart === 0) { problem = `? ${operator} ${b} = ${c}`; answer = a; }
    else if (missingPart === 1) { problem = `${a} ${operator} ? = ${c}`; answer = b; }
    else { problem = `${a} ${operator} ${b} = ?`; answer = c; }
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
            distractors.add(parseFloat((correctAnswer / (multipliers[distractors.size - 1] * 10)).toPrecision(15)));
        }
    }
    return Array.from(distractors).sort(() => Math.random() - 0.5);
}

// --- Event Listeners ---
window.addEventListener('load', init);
optionButtons.forEach(btn => btn.addEventListener('click', handleAnswer));
secretBoxes.forEach(box => box.addEventListener('click', handleSecretBoxChoice));
