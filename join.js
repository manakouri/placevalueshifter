// join.js
import { db, auth } from './firebase-config.js';
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-firestore.js";
import { signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-auth.js";

// --- DOM Element References ---
const gameCodeInput = document.getElementById('game-code');
const teamNameInput = document.getElementById('team-name');
const joinBtn = document.getElementById('join-btn');
const errorMessage = document.getElementById('error-message');

// --- Main Initializer ---
// Waits for the page to be fully loaded before running any code.
window.addEventListener('load', () => {
    // Keep inputs disabled until we have a secure connection.
    gameCodeInput.disabled = true;
    teamNameInput.disabled = true;
    
    // Start the sign-in process and set up event listeners.
    signInPlayerAnonymously();
    gameCodeInput.addEventListener('input', validateForm);
    teamNameInput.addEventListener('input', validateForm);
    joinBtn.addEventListener('click', joinGame);
});

// --- Authentication ---
// Silently signs the player in to get a temporary user ID.
function signInPlayerAnonymously() {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // SUCCESS: The user is signed in.
            console.log("Player is authenticated with UID:", user.uid);
            
            // Now, enable the form so the player can type.
            gameCodeInput.disabled = false;
            teamNameInput.disabled = false;
            joinBtn.textContent = "Join Game";
            validateForm(); // Check if the button should be enabled.
        } else {
            // The user is not signed in, so we attempt to sign them in.
            signInAnonymously(auth).catch((error) => {
                console.error("Anonymous sign-in failed:", error);
                errorMessage.textContent = "Error: Could not connect to the server.";
                joinBtn.textContent = "Connection Failed";
            });
        }
    });
}

// --- Form Validation ---
// Checks if the form is filled out correctly.
function validateForm() {
    const code = gameCodeInput.value.trim();
    const name = teamNameInput.value.trim();
    
    // The button is only enabled if the inputs are valid AND the user is signed in.
    const isReadyToJoin = code.length === 7 && name.length > 0 && auth.currentUser;
    joinBtn.disabled = !isReadyToJoin;
}

// --- Join Game Logic ---
// Handles the process of joining a game when the button is clicked.
async function joinGame() {
    const gameCode = gameCodeInput.value.trim();
    const teamName = teamNameInput.value.trim();
    errorMessage.textContent = '';
    joinBtn.disabled = true; // Disable while we process.

    const gameDocRef = doc(db, 'games', gameCode);

    try {
        const gameDoc = await getDoc(gameDocRef);

        // Check 1: Does the game exist?
        if (!gameDoc.exists()) {
            errorMessage.textContent = 'Game not found. Check the code and try again.';
            return;
        }

        const gameData = gameDoc.data();
        
        // Check 2: Is the team name already taken?
        if (gameData.players && gameData.players[teamName]) {
            errorMessage.textContent = 'This team name is already taken.';
            return;
        }
        
        // Check 3: Is the game full?
        if (gameData.players && Object.keys(gameData.players).length >= 20) {
            errorMessage.textContent = 'This game is full.';
            return;
        }

        // All checks passed. Add the player to the game.
        const playerData = {
            score: 0,
            questionsAnswered: 0,
            questionsCorrect: 0
        };

        await updateDoc(gameDocRef, {
            [`players.${teamName}`]: playerData
        });
        
        // Redirect to the game screen.
        window.location.href = `game.html?code=${gameCode}&team=${encodeURIComponent(teamName)}`;

    } catch (e) {
        console.error("Error joining game:", e);
        errorMessage.textContent = 'Could not join game. Please try again.';
    } finally {
        // Re-enable the button if there was an error.
        validateForm();
    }
}
