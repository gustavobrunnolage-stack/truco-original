const socket = io();

// Estado do jogo
let gameState = {
  roomId: null,
  playerName: '',
  isMyTurn: false,
  gamePhase: 'lobby',
  playerHand: [],
  currentPlayer: null,
  scores: { player1: 0, player2: 0 },
  playerNames: {},
  playerId: null
};

// Elementos do DOM
const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const playerNameInput = document.getElementById('player-name');
const gameTypeSelect = document.getElementById('game-type');
const betAmountInput = document.getElementById('bet-amount');
const createRoomBtn = document.getElementById('create-room');
const joinRoomBtn = document.getElementById('join-room');
const roomInfo = document.getElementById('room-info');
const roomCodeDisplay = document.getElementById('room-code-display');
const copyCodeBtn = document.getElementById('copy-code');

// Elementos do jogo
const playerHand = document.getElementById('player-hand');
const playedCards = document.getElementById('played-cards');
const viraCard = document.getElementById('vira-card');
const playerScore = document.getElementById('player-score');
const opponentScore = document.getElementById('opponent-score');
const currentRound = document.getElementById('current-round');
const roundValue = document.getElementById('round-value');
const playerNameDisplay = document.getElementById('player-name-display');
const opponentName = document.getElementById('opponent-name');

// Controles de truco
const btnTruco = document.getElementById('btn-truco');
const btnSeis = document.getElementById('btn-seis');
const btnNove = document.getElementById('btn-nove');
const btnDoze = document.getElementById('btn-doze');

// Modal de truco
const trucoModal = document.getElementById('truco-modal');
const trucoTitle = document.getElementById('truco-title');
const trucoRequester = document.getElementById('truco-requester');
const trucoTypeText = document.getElementById('truco-type-text');
const trucoPoints = document.getElementById('truco-points');
const acceptTrucoBtn = document.getElementById('accept-truco');
const rejectTrucoBtn = document.getElementById('reject-truco');

// Chat
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendMessageBtn = document.getElementById('send-message');
const toggleChatBtn = document.getElementById('toggle-chat');
const emojiButtons = document.querySelectorAll('.btn-emoji');

// Modal de fim de jogo
const gameOverModal = document.getElementById('game-over-modal');
const gameResultTitle = document.getElementById('game-result-title');
const winnerText = document.getElementById('winner-text');
const finalPlayerScore = document.getElementById('final-player-score');
const finalOpponentScore = document.getElementById('final-opponent-score');
const newGameBtn = document.getElementById('new-game');
const backToLobbyBtn = document.getElementById('back-to-lobby');

// Loading
const loading = document.getElementById('loading');
const loadingText = document.getElementById('loading-text');

// Event Listeners do Lobby
createRoomBtn.addEventListener('click', createRoom);
joinRoomBtn.addEventListener('click', joinRoom);
copyCodeBtn.addEventListener('click', copyRoomCode);

// Event Listeners do Jogo
document.getElementById('leave-game').addEventListener('click', leaveGame);
btnTruco.addEventListener('click', () => requestTruco('truco'));
btnSeis.addEventListener('click', () => requestTruco('seis'));
btnNove.addEventListener('click', () => requestTruco('nove'));
btnDoze.addEventListener('click', () => requestTruco('doze'));

// Event Listeners do Modal de Truco
acceptTrucoBtn.addEventListener('click', () => respondTruco('accept'));
rejectTrucoBtn.addEventListener('click', () => respondTruco('reject'));

// Event Listeners do Chat
sendMessageBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});
toggleChatBtn.addEventListener('click', toggleChat);
emojiButtons.forEach(btn => {
  btn.addEventListener('click', () => sendEmoji(btn.dataset.emoji));
});

// Event Listeners dos Modais
newGameBtn.addEventListener('click', startNewGame);
backToLobbyBtn.addEventListener('click', backToLobby);

// Funções do Lobby
function createRoom() {
  const playerName = playerNameInput.value.trim() || 'Jogador 1';
  const gameType = gameTypeSelect.value;
  const betAmount = parseFloat(betAmountInput.value) || 0;
  
  if (betAmount < 0) {
    alert('Valor da aposta deve ser positivo!');
    return;
  }
  
  gameState.playerName = playerName;
  
  // Feedback diferente para jogo gratuito
  if (betAmount === 0) {
    showLoading('Criando sala gratuita... Um bot entrará automaticamente!');
  } else {
    showLoading('Criando sala...');
  }
  
  socket.emit('createRoom', { playerName, gameType, betAmount });
}

function joinRoom() {
  const playerName = playerNameInput.value.trim() || 'Jogador 2';
  const roomId = prompt('Digite o código da sala:');
  
  if (!roomId) return;
  
  gameState.playerName = playerName;
  showLoading('Entrando na sala...');
  
  socket.emit('joinRoom', { roomId: roomId.toUpperCase(), playerName });
}

function copyRoomCode() {
  const roomCode = roomCodeDisplay.textContent;
  navigator.clipboard.writeText(roomCode).then(() => {
    copyCodeBtn.innerHTML = '<i class="fas fa-check"></i>';
    setTimeout(() => {
      copyCodeBtn.innerHTML = '<i class="fas fa-copy"></i>';
    }, 2000);
  });
}

// Funções do Jogo
function playCard(cardIndex) {
  if (!gameState.isMyTurn) {
    showNotification('Não é sua vez!', 'warning');
    return;
  }
  
  socket.emit('playCard', { roomId: gameState.roomId, cardIndex });
}

function requestTruco(trucoType) {
  if (!gameState.isMyTurn) {
    showNotification('Não é sua vez de pedir truco!', 'warning');
    return;
  }
  
  socket.emit('requestTruco', { roomId: gameState.roomId, trucoType });
}

function respondTruco(response) {
  socket.emit('respondTruco', { roomId: gameState.roomId, response });
  closeTrucoModal();
}

function leaveGame() {
  if (confirm('Deseja realmente sair da partida?')) {
    socket.disconnect();
    backToLobby();
  }
}

// Funções do Chat
function sendMessage() {
  const message = chatInput.value.trim();
  if (!message || !gameState.roomId) return;
  
  socket.emit('sendMessage', { roomId: gameState.roomId, message });
  chatInput.value = '';
}

function sendEmoji(emoji) {
  if (!gameState.roomId) return;
  socket.emit('sendEmoji', { roomId: gameState.roomId, emoji });
}

function toggleChat() {
  const chatContent = document.querySelector('.chat-content');
  const icon = toggleChatBtn.querySelector('i');
  
  chatContent.classList.toggle('collapsed');
  icon.classList.toggle('fa-chevron-up');
  icon.classList.toggle('fa-chevron-down');
}

// Funções de UI
function showScreen(screenName) {
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });
  
  if (screenName === 'lobby') {
    lobbyScreen.classList.add('active');
  } else if (screenName === 'game') {
    gameScreen.classList.add('active');
  }
}

function showLoading(text = 'Carregando...') {
  loadingText.textContent = text;
  loading.style.display = 'flex';
}

function hideLoading() {
  loading.style.display = 'none';
}

function showNotification(message, type = 'info') {
  // Criar elemento de notificação
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  // Remover após 3 segundos
  setTimeout(() => {
    notification.remove();
  }, 3000);
}

function updatePlayerHand(cards) {
  playerHand.innerHTML = '';
  
  cards.forEach((card, index) => {
    const cardElement = createCardElement(card, true);
    cardElement.addEventListener('click', () => playCard(index));
    cardElement.classList.add('clickable');
    playerHand.appendChild(cardElement);
  });
}

function createCardElement(card, showFace = true) {
  const cardElement = document.createElement('div');
  cardElement.className = 'card';
  
  if (!showFace) {
    cardElement.classList.add('card-back');
    return cardElement;
  }
  
  cardElement.classList.add('card-face');
  if (card.isManilha) {
    cardElement.classList.add('manilha');
  }
  
  const suitSymbols = {
    'copas': '♥',
    'ouros': '♦',
    'espadas': '♠',
    'paus': '♣'
  };
  
  const suitColors = {
    'copas': 'red',
    'ouros': 'red',
    'espadas': 'black',
    'paus': 'black'
  };
  
  cardElement.innerHTML = `
    <div class="card-content">
      <div class="card-corner top-left">
        <div class="card-value">${card.value}</div>
        <div class="card-suit ${suitColors[card.suit]}">${suitSymbols[card.suit]}</div>
      </div>
      <div class="card-center ${suitColors[card.suit]}">
        ${suitSymbols[card.suit]}
      </div>
      <div class="card-corner bottom-right">
        <div class="card-value">${card.value}</div>
        <div class="card-suit ${suitColors[card.suit]}">${suitSymbols[card.suit]}</div>
      </div>
    </div>
  `;
  
  return cardElement;
}

function updatePlayedCards(playedCardsData) {
  playedCards.innerHTML = '';
  
  playedCardsData.forEach((play, index) => {
    const cardElement = createCardElement(play.card, true);
    cardElement.classList.add('played-card');
    
    // Adicionar indicador do jogador
    const playerIndicator = document.createElement('div');
    playerIndicator.className = 'player-indicator';
    playerIndicator.textContent = play.playerId === socket.id ? 'Você' : 'Oponente';
    cardElement.appendChild(playerIndicator);
    
    playedCards.appendChild(cardElement);
  });
}

function updateVira(viraCardData) {
  if (!viraCardData) return;
  
  const cardElement = createCardElement(viraCardData, true);
  viraCard.innerHTML = '';
  viraCard.appendChild(cardElement);
}

function updateScores(scores, playerNames, players) {
  // Determinar qual jogador somos
  const myPlayerIndex = players.indexOf(socket.id);
  const opponentIndex = myPlayerIndex === 0 ? 1 : 0;
  
  if (myPlayerIndex === 0) {
    playerScore.textContent = scores.player1;
    opponentScore.textContent = scores.player2;
  } else {
    playerScore.textContent = scores.player2;
    opponentScore.textContent = scores.player1;
  }
  
  // Atualizar nomes
  if (playerNames) {
    playerNameDisplay.textContent = playerNames[socket.id] || 'Você';
    const opponentId = players[opponentIndex];
    opponentName.textContent = playerNames[opponentId] || 'Oponente';
  }
}

function updateTrucoButtons(trucoState, currentRoundValue) {
  // Ocultar todos os botões primeiro
  [btnTruco, btnSeis, btnNove, btnDoze].forEach(btn => btn.style.display = 'none');
  
  if (trucoState.pendingResponse) {
    // Se há uma resposta pendente, não mostrar botões
    return;
  }
  
  // Mostrar botões baseado no valor atual
  if (currentRoundValue === 1) {
    btnTruco.style.display = 'block';
  } else if (currentRoundValue === 3) {
    btnSeis.style.display = 'block';
  } else if (currentRoundValue === 6) {
    btnNove.style.display = 'block';
  } else if (currentRoundValue === 9) {
    btnDoze.style.display = 'block';
  }
}

function showTrucoModal(data) {
  const trucoTypes = {
    'truco': { text: 'TRUCO', points: 3 },
    'seis': { text: 'SEIS', points: 6 },
    'nove': { text: 'NOVE', points: 9 },
    'doze': { text: 'DOZE', points: 12 }
  };
  
  const trucoInfo = trucoTypes[data.trucoType] || trucoTypes.truco;
  
  trucoTitle.textContent = trucoInfo.text + '!';
  trucoRequester.textContent = gameState.playerNames[data.requestedBy] || 'Oponente';
  trucoTypeText.textContent = trucoInfo.text;
  trucoPoints.textContent = trucoInfo.points;
  
  trucoModal.style.display = 'flex';
}

function closeTrucoModal() {
  trucoModal.style.display = 'none';
}

function showGameOverModal(data) {
  const myPlayerIndex = gameState.currentPlayer === socket.id ? 0 : 1;
  const isWinner = (data.winner === 'player1' && myPlayerIndex === 0) || 
                   (data.winner === 'player2' && myPlayerIndex === 1);
  
  gameResultTitle.textContent = isWinner ? 'VITÓRIA!' : 'DERROTA!';
  winnerText.textContent = isWinner ? 'Parabéns! Você venceu!' : 'Que pena! Você perdeu!';
  
  if (myPlayerIndex === 0) {
    finalPlayerScore.textContent = data.finalScores.player1;
    finalOpponentScore.textContent = data.finalScores.player2;
  } else {
    finalPlayerScore.textContent = data.finalScores.player2;
    finalOpponentScore.textContent = data.finalScores.player1;
  }
  
  gameOverModal.style.display = 'flex';
}

function addChatMessage(data) {
  const messageElement = document.createElement('div');
  messageElement.className = 'chat-message';
  
  if (data.type === 'emoji') {
    messageElement.innerHTML = `
      <div class="message-header">
        <span class="player-name">${data.playerName}</span>
        <span class="message-time">${formatTime(data.timestamp)}</span>
      </div>
      <div class="message-content emoji-message">${data.message}</div>
    `;
  } else {
    messageElement.innerHTML = `
      <div class="message-header">
        <span class="player-name">${data.playerName}</span>
        <span class="message-time">${formatTime(data.timestamp)}</span>
      </div>
      <div class="message-content">${data.message}</div>
    `;
  }
  
  chatMessages.appendChild(messageElement);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function startNewGame() {
  gameOverModal.style.display = 'none';
  backToLobby();
}

function backToLobby() {
  gameState = {
    roomId: null,
    playerName: '',
    isMyTurn: false,
    gamePhase: 'lobby',
    playerHand: [],
    currentPlayer: null,
    scores: { player1: 0, player2: 0 },
    playerNames: {},
    playerId: null
  };
  
  showScreen('lobby');
  roomInfo.style.display = 'none';
  hideLoading();
}

// Socket Event Listeners
socket.on('roomCreated', (data) => {
  hideLoading();
  gameState.roomId = data.roomId;
  roomCodeDisplay.textContent = data.roomId;
  roomInfo.style.display = 'block';
  
  document.getElementById('current-room-code').textContent = data.roomId;
  document.getElementById('current-game-type').textContent = 
    gameTypeSelect.value === 'paulista' ? 'Truco Paulista' : 'Truco Mineiro';
  document.getElementById('current-bet').textContent = betAmountInput.value || '0.00';
});

socket.on('gameStarted', (data) => {
  hideLoading();
  gameState.playerNames = data.playerNames;
  showScreen('game');
  showNotification('Jogo iniciado! Boa sorte!', 'success');
});

socket.on('gameState', (data) => {
  gameState.isMyTurn = data.players[data.currentPlayerIndex] === socket.id;
  gameState.playerHand = data.playerHand;
  gameState.currentPlayer = data.players[data.currentPlayerIndex];
  gameState.scores = data.scores;
  
  // Atualizar interface
  updatePlayerHand(data.playerHand);
  updatePlayedCards(data.playedCards);
  updateVira(data.vira);
  updateScores(data.scores, gameState.playerNames, data.players);
  updateTrucoButtons(data.trucoState, data.currentRoundValue);
  
  currentRound.textContent = data.currentRound;
  roundValue.textContent = data.currentRoundValue;
  
  // Atualizar chat
  if (data.chat) {
    chatMessages.innerHTML = '';
    data.chat.forEach(msg => {
      addChatMessage({
        playerName: gameState.playerNames[msg.playerId] || 'Jogador',
        message: msg.message,
        type: msg.type,
        timestamp: msg.timestamp
      });
    });
  }
  
  // Feedback visual de turno
  const playerArea = document.querySelector('.player-area');
  const opponentArea = document.querySelector('.opponent-area');
  
  if (gameState.isMyTurn) {
    playerArea.classList.add('active-turn');
    opponentArea.classList.remove('active-turn');
    showNotification('Sua vez!', 'info');
  } else {
    playerArea.classList.remove('active-turn');
    opponentArea.classList.add('active-turn');
  }
});

socket.on('trucoRequested', (data) => {
  if (data.requestedBy !== socket.id) {
    showTrucoModal(data);
  } else {
    showNotification('Truco pedido! Aguardando resposta...', 'info');
  }
});

socket.on('trucoResponse', (data) => {
  closeTrucoModal();
  
  if (data.result === 'accepted') {
    showNotification('Truco aceito!', 'success');
  } else {
    showNotification('Adversário correu!', 'warning');
  }
});

socket.on('gameFinished', (data) => {
  setTimeout(() => {
    showGameOverModal(data);
  }, 2000);
});

socket.on('chatMessage', (data) => {
  addChatMessage(data);
});

socket.on('playerDisconnected', (data) => {
  showNotification(`${data.playerName} desconectou`, 'warning');
  setTimeout(() => {
    backToLobby();
  }, 3000);
});

socket.on('roomError', (message) => {
  hideLoading();
  alert(message);
});

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  showScreen('lobby');
  
  // Focar no campo de nome
  playerNameInput.focus();
});