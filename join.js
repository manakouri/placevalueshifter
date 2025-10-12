// join.js
import { db, auth } from './firebase-config.js'; // <-- Make sure auth is imported
import { doc, getDoc, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-firestore.js";
import { signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-auth.js"; // <-- Add new imports

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
