// join.js
import { db, auth } from './firebase-config.js';
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-firestore.js";
import { signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-auth.js";

// DOM Elements
const gameCodeInput = document.getElementById('game-code');
const teamNameInput = document.getElementById('team-name');
const joinBtn = document.getElementById('join-btn');
const errorMessage = document.getElementById('error-message');

// --- Main Initializer ---
window.addEventListener('load', () => {
    // Start with inputs disabled until user is signed in
    gameCodeInput.disabled = true;
    teamNameInput.disabled = true;
    signInPlayerAnonymously();
});

// --- Authentication ---
function signInPlayerAnonymously() {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // User is signed in. Now they can interact with the form.
            console.log("User is signed in with uid:", user.uid);
            gameCodeInput.disabled = false;
            teamNameInput.disabled = false;
            joinBtn.textContent = "Join Game";
            validateForm(); // Check if the button should be enabled now
        } else {
            // User is not signed in. Attempt to sign them in.
            signInAnonymously(auth).catch((error) => {
                console.error("Anonymous sign-in failed:", error);
                errorMessage.textContent = "Could not connect to server.";
            });
        }
    });
}

// --- Form Validation ---
function validateForm() {
    // Only enable the button if inputs are filled AND the user is signed in.
    const code = gameCodeInput.value.trim();
    const name = teamNameInput.value.trim();
    const canJoin = code.length === 7 && name.length > 0 && auth.currentUser;
    joinBtn.disabled = !canJoin;
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
        if (gameData.players && gameData.players[teamName]) {
            errorMessage.textContent = 'This team name is already taken.';
            return;
        }
        
        if(gameData.players && Object.keys(gameData.players).length >= 20){
            errorMessage.textContent = 'This game is full.';
            return;
        }

        const playerData = {
            score: 0,
            questionsAnswered: 0,
            questionsCorrect: 0
        };

        // This update will now be sent by an authenticated user
        await updateDoc(gameDocRef, {
            [`players.${teamName}`]: playerData
        });
        
        window.location.href = `game.html?code=${gameCode}&team=${encodeURIComponent(teamName)}`;

    } catch (e) {
        console.error("Error joining game: ", e);
        errorMessage.textContent = 'Could not join game. Please try again.';
    } finally {
        validateForm();
    }
}

// --- Event Listeners ---
gameCodeInput.addEventListener('input', validateForm);
teamNameInput.addEventListener('input', validateForm);
joinBtn.addEventListener('click', joinGame);
