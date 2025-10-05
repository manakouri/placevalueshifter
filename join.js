// join.js
import { db } from './firebase-config.js';
import { doc, getDoc, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-firestore.js";

// DOM Elements
const gameCodeInput = document.getElementById('game-code');
const teamNameInput = document.getElementById('team-name');
const joinBtn = document.getElementById('join-btn');
const errorMessage = document.getElementById('error-message');

// --- Form Validation ---
function validateForm() {
    const code = gameCodeInput.value.trim();
    const name = teamNameInput.value.trim();
    joinBtn.disabled = !(code.length === 7 && name.length > 0);
}

// --- Join Game Logic ---
async function joinGame() {
    const gameCode = gameCodeInput.value.trim();
    const teamName = teamNameInput.value.trim();
    errorMessage.textContent = '';
    joinBtn.disabled = true;

    const gameDocRef = doc(db, 'games', gameCode);

    try {
        const gameDoc = await getDoc(gameDocRef);

        if (!gameDoc.exists()) {
            errorMessage.textContent = 'Game not found. Check the code and try again.';
            return;
        }

        const gameData = gameDoc.data();
        if (gameData.players[teamName]) {
            errorMessage.textContent = 'This team name is already taken.';
            return;
        }
        
        if(Object.keys(gameData.players).length >= 20){
            errorMessage.textContent = 'This game is full.';
            return;
        }
        
        if(gameData.gameState !== 'waiting'){
             errorMessage.textContent = 'This game has already started.';
             return;
        }


        // Add player to the game document
        const playerData = {
            score: 0,
            questionsAnswered: 0,
            questionsCorrect: 0
        };

        await updateDoc(gameDocRef, {
            [`players.${teamName}`]: playerData
        });
        
        // Navigate to game screen, passing info via URL parameters
        window.location.href = `game.html?code=${gameCode}&team=${encodeURIComponent(teamName)}`;

    } catch (e) {
        console.error("Error joining game: ", e);
        errorMessage.textContent = 'Could not join game. Please try again.';
    } finally {
        validateForm(); // Re-enable button if fields are valid
    }
}

// --- Event Listeners ---
gameCodeInput.addEventListener('input', validateForm);
teamNameInput.addEventListener('input', validateForm);
joinBtn.addEventListener('click', joinGame);
