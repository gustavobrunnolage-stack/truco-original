const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const PORT = process.env.PORT || 3000;

let rooms = {};

app.use(express.static('public'));

// Classe para Bot (Jogador Automático)
class TrucoBot {
  constructor(gameInstance, playerId) {
    this.game = gameInstance;
    this.playerId = playerId;
    this.name = this.generateBotName();
    this.difficulty = 'medium'; // easy, medium, hard
    this.personality = this.generatePersonality();
  }

  generateBotName() {
    const names = [
      'Zé Pereira', 'João Mineiro', 'Pedro Gaúcho', 'Maria Caipira',
      'Antônio Sertanejo', 'Carlos Matuto', 'Francisco Roceiro',
      'Sebastião Caboclo', 'Joaquim Caipira', 'Manuel Tropeiro'
    ];
    return names[Math.floor(Math.random() * names.length)];
  }

  generatePersonality() {
    const personalities = ['aggressive', 'conservative', 'balanced', 'unpredictable'];
    return personalities[Math.floor(Math.random() * personalities.length)];
  }

  // Avaliar força da mão (0-100)
  evaluateHand() {
    const hand = this.game.playerHands[this.playerId];
    if (!hand) return 0;

    let score = 0;
    hand.forEach(card => {
      if (card.isManilha) {
        score += 35; // Manilhas valem muito
      } else if (card.strength >= 8) {
        score += 20; // Cartas altas (A, 2, 3)
      } else if (card.strength >= 5) {
        score += 10; // Cartas médias (Q, J, K)
      } else {
        score += 5; // Cartas baixas
      }
    });

    return Math.min(score, 100);
  }

  // Escolher melhor carta para jogar
  chooseCard() {
    const hand = this.game.playerHands[this.playerId];
    if (!hand || hand.length === 0) return -1;

    const playedCards = this.game.playedCards;
    
    // Se é o primeiro a jogar na rodada
    if (playedCards.length === 0) {
      return this.chooseFirstCard(hand);
    }
    
    // Se é o segundo a jogar (responder)
    const opponentCard = playedCards[0].card;
    return this.chooseResponseCard(hand, opponentCard);
  }

  chooseFirstCard(hand) {
    const handStrength = this.evaluateHand();
    
    // Se mão é forte, joga carta média para "esconder o jogo"
    if (handStrength > 70) {
      const mediumCards = hand
        .map((card, index) => ({ card, index }))
        .filter(item => item.card.strength >= 5 && item.card.strength <= 8 && !item.card.isManilha)
        .sort((a, b) => a.card.strength - b.card.strength);
      
      if (mediumCards.length > 0) {
        return mediumCards[0].index;
      }
    }
    
    // Se mão é fraca, joga a carta mais baixa
    if (handStrength < 40) {
      const weakestIndex = hand.reduce((minIndex, card, index) => 
        card.strength < hand[minIndex].strength ? index : minIndex, 0);
      return weakestIndex;
    }
    
    // Mão média - joga carta aleatória que não seja manilha
    const nonManilhas = hand
      .map((card, index) => ({ card, index }))
      .filter(item => !item.card.isManilha);
    
    if (nonManilhas.length > 0) {
      return nonManilhas[Math.floor(Math.random() * nonManilhas.length)].index;
    }
    
    return 0; // Fallback
  }

  chooseResponseCard(hand, opponentCard) {
    // Tentar ganhar com a menor carta possível
    const winningCards = hand
      .map((card, index) => ({ card, index }))
      .filter(item => item.card.strength > opponentCard.strength)
      .sort((a, b) => a.card.strength - b.card.strength);
    
    if (winningCards.length > 0) {
      // Se tem carta para ganhar, usa a menor
      return winningCards[0].index;
    }
    
    // Se não pode ganhar, joga a menor carta
    const weakestIndex = hand.reduce((minIndex, card, index) => 
      card.strength < hand[minIndex].strength ? index : minIndex, 0);
    return weakestIndex;
  }

  // Decidir se deve pedir truco
  shouldRequestTruco() {
    const handStrength = this.evaluateHand();
    const currentValue = this.game.currentRoundValue;
    
    // Baseado na personalidade e força da mão
    switch (this.personality) {
      case 'aggressive':
        return handStrength > 50 && Math.random() > 0.3;
      case 'conservative':
        return handStrength > 80 && Math.random() > 0.7;
      case 'balanced':
        return handStrength > 65 && Math.random() > 0.5;
      case 'unpredictable':
        return Math.random() > 0.4; // Mais imprevisível
      default:
        return handStrength > 70 && Math.random() > 0.6;
    }
  }

  // Decidir se aceita truco do oponente
  shouldAcceptTruco() {
    const handStrength = this.evaluateHand();
    const roundWins = this.game.roundWins;
    const myWins = this.playerId === this.game.players[0] ? roundWins.player1 : roundWins.player2;
    
    // Se já ganhou uma rodada, é mais corajoso
    const courage = myWins > 0 ? 15 : 0;
    
    switch (this.personality) {
      case 'aggressive':
        return (handStrength + courage) > 45;
      case 'conservative':
        return (handStrength + courage) > 75;
      case 'balanced':
        return (handStrength + courage) > 60;
      case 'unpredictable':
        return Math.random() > 0.4;
      default:
        return (handStrength + courage) > 65;
    }
  }

  // Simular delay humano para jogadas
  async makeMove() {
    const delay = 1500 + Math.random() * 2000; // 1.5-3.5 segundos
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  // Enviar mensagem ocasional no chat
  sendRandomMessage() {
    if (Math.random() > 0.85) { // 15% chance
      const messages = [
        'Boa jogada!', 'Vamos ver!', 'Interessante...', 'Hmm...', 
        'Tá difícil!', 'Agora vai!', 'Partiu!', 'Show!', 'Valeu!'
      ];
      const message = messages[Math.floor(Math.random() * messages.length)];
      
      return {
        playerId: this.playerId,
        message,
        type: 'text',
        timestamp: Date.now()
      };
    }
    return null;
  }

  // Enviar emoji ocasional
  sendRandomEmoji() {
    if (Math.random() > 0.9) { // 10% chance
      const emojis = ['😀', '😎', '🤔', '👏', '🔥', '💪'];
      const emoji = emojis[Math.floor(Math.random() * emojis.length)];
      
      return {
        playerId: this.playerId,
        message: emoji,
        type: 'emoji',
        timestamp: Date.now()
      };
    }
    return null;
  }
}

// Classe para gerenciar o jogo de Truco
class TrucoGame {
  constructor(roomId, gameType, betAmount) {
    this.roomId = roomId;
    this.gameType = gameType; // 'paulista' ou 'mineiro'
    this.betAmount = betAmount;
    this.players = [];
    this.currentPlayerIndex = 0;
    this.deck = [];
    this.playedCards = [];
    this.playerHands = {};
    this.scores = { player1: 0, player2: 0 };
    this.currentRoundValue = 1;
    this.roundWins = { player1: 0, player2: 0 };
    this.gamePhase = 'waiting'; // waiting, dealing, playing, betting, finished
    this.manilha = null;
    this.vira = null;
    this.currentRound = 1;
    this.whoStarted = 0;
    this.trucoState = {
      requested: false,
      requestedBy: null,
      pendingResponse: false,
      currentValue: 1
    };
    this.chat = [];
  }

  // Criar baralho de 40 cartas
  createDeck() {
    const suits = ['ouros', 'espadas', 'copas', 'paus'];
    const values = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];
    
    this.deck = [];
    for (let suit of suits) {
      for (let value of values) {
        this.deck.push({ suit, value, strength: this.getCardStrength(value, suit) });
      }
    }
  }

  // Força da carta (sem considerar manilha ainda)
  getCardStrength(value, suit) {
    const baseStrength = {
      '4': 1, '5': 2, '6': 3, '7': 4, 'Q': 5, 'J': 6, 'K': 7, 'A': 8, '2': 9, '3': 10
    };
    return baseStrength[value];
  }

  // Embaralhar cartas
  shuffleDeck() {
    for (let i = this.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
    }
  }

  // Calcular manilhas baseado na vira
  calculateManilhas(vira) {
    const nextValue = {
      '4': '5', '5': '6', '6': '7', '7': 'Q', 'Q': 'J', 
      'J': 'K', 'K': 'A', 'A': '2', '2': '3', '3': '4'
    };
    
    const manilhaValue = nextValue[vira.value];
    const manilhaOrder = ['ouros', 'espadas', 'copas', 'paus']; // ordem de força das manilhas
    
    return manilhaOrder.map((suit, index) => ({
      suit,
      value: manilhaValue,
      strength: 14 + index, // manilhas têm força 14+
      isManilha: true
    }));
  }

  // Atualizar força das cartas considerando manilhas
  updateCardStrengths() {
    if (!this.vira) return;
    
    const manilhas = this.calculateManilhas(this.vira);
    
    // Atualizar deck
    this.deck.forEach(card => {
      const isManilha = manilhas.some(m => m.suit === card.suit && m.value === card.value);
      if (isManilha) {
        const manilha = manilhas.find(m => m.suit === card.suit && m.value === card.value);
        card.strength = manilha.strength;
        card.isManilha = true;
      }
    });

    // Atualizar mãos dos jogadores
    Object.keys(this.playerHands).forEach(playerId => {
      this.playerHands[playerId].forEach(card => {
        const isManilha = manilhas.some(m => m.suit === card.suit && m.value === card.value);
        if (isManilha) {
          const manilha = manilhas.find(m => m.suit === card.suit && m.value === card.value);
          card.strength = manilha.strength;
          card.isManilha = true;
        }
      });
    });
  }

  // Distribuir cartas
  dealCards() {
    this.createDeck();
    this.shuffleDeck();
    
    // Pegar a vira (primeira carta)
    this.vira = this.deck.pop();
    this.updateCardStrengths();
    
    // Distribuir 3 cartas para cada jogador
    this.playerHands = {};
    this.players.forEach(playerId => {
      this.playerHands[playerId] = [];
      for (let i = 0; i < 3; i++) {
        this.playerHands[playerId].push(this.deck.pop());
      }
    });
    
    this.gamePhase = 'playing';
    this.playedCards = [];
    this.roundWins = { player1: 0, player2: 0 };
    this.currentRound = 1;
  }

  // Jogar carta
  playCard(playerId, cardIndex) {
    if (this.gamePhase !== 'playing') return false;
    if (this.players[this.currentPlayerIndex] !== playerId) return false;
    
    const playerHand = this.playerHands[playerId];
    if (!playerHand || cardIndex < 0 || cardIndex >= playerHand.length) return false;
    
    const card = playerHand.splice(cardIndex, 1)[0];
    this.playedCards.push({ playerId, card });
    
    // Se ambos jogaram, determinar vencedor da rodada
    if (this.playedCards.length === 2) {
      this.resolveRound();
    } else {
      // Próximo jogador
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % 2;
    }
    
    return true;
  }

  // Resolver rodada
  resolveRound() {
    const [play1, play2] = this.playedCards;
    let winner = null;
    
    if (play1.card.strength > play2.card.strength) {
      winner = play1.playerId;
    } else if (play2.card.strength > play1.card.strength) {
      winner = play2.playerId;
    } else {
      // Empate - ninguém ganha a rodada
      winner = 'draw';
    }
    
    // Atualizar contadores de vitórias da rodada
    if (winner !== 'draw') {
      const playerIndex = this.players.indexOf(winner);
      if (playerIndex === 0) {
        this.roundWins.player1++;
      } else {
        this.roundWins.player2++;
      }
      
      // Quem ganhou a rodada começa a próxima
      this.currentPlayerIndex = playerIndex;
    }
    
    this.currentRound++;
    this.playedCards = [];
    
    // Verificar se alguém ganhou a mão (melhor de 3)
    if (this.roundWins.player1 >= 2) {
      this.endHand('player1');
    } else if (this.roundWins.player2 >= 2) {
      this.endHand('player2');
    } else if (this.currentRound > 3) {
      // Se chegou na 3ª rodada e ainda não teve vencedor, avaliar
      if (this.roundWins.player1 > this.roundWins.player2) {
        this.endHand('player1');
      } else if (this.roundWins.player2 > this.roundWins.player1) {
        this.endHand('player2');
      } else {
        // Empate na mão - primeiro a fazer ponto ganha
        this.endHand('draw');
      }
    }
  }

  // Finalizar mão
  endHand(winner) {
    if (winner === 'player1') {
      this.scores.player1 += this.currentRoundValue;
    } else if (winner === 'player2') {
      this.scores.player2 += this.currentRoundValue;
    }
    
    // Verificar vitória do jogo
    if (this.scores.player1 >= 12) {
      this.gamePhase = 'finished';
      return 'player1';
    } else if (this.scores.player2 >= 12) {
      this.gamePhase = 'finished';
      return 'player2';
    }
    
    // Resetar para próxima mão
    this.resetForNextHand();
    return winner;
  }

  // Resetar para próxima mão
  resetForNextHand() {
    this.currentRoundValue = 1;
    this.trucoState = {
      requested: false,
      requestedBy: null,
      pendingResponse: false,
      currentValue: 1
    };
    this.gamePhase = 'dealing';
    
    // Próximo jogador começa
    this.whoStarted = (this.whoStarted + 1) % 2;
    this.currentPlayerIndex = this.whoStarted;
  }

  // Pedir truco
  requestTruco(playerId, trucoType = 'truco') {
    if (this.trucoState.pendingResponse) return false;
    if (this.players[this.currentPlayerIndex] !== playerId) return false;
    
    const values = { truco: 3, seis: 6, nove: 9, doze: 12 };
    const newValue = values[trucoType] || 3;
    
    if (newValue <= this.currentRoundValue) return false;
    
    this.trucoState = {
      requested: true,
      requestedBy: playerId,
      pendingResponse: true,
      currentValue: newValue,
      type: trucoType
    };
    
    return true;
  }

  // Responder truco
  respondTruco(playerId, response) {
    if (!this.trucoState.pendingResponse) return false;
    if (this.trucoState.requestedBy === playerId) return false;
    
    this.trucoState.pendingResponse = false;
    
    if (response === 'accept') {
      this.currentRoundValue = this.trucoState.currentValue;
      this.trucoState.requested = false;
      return 'accepted';
    } else {
      // Correr - quem pediu truco ganha a mão
      const winnerIndex = this.players.indexOf(this.trucoState.requestedBy);
      if (winnerIndex === 0) {
        this.scores.player1 += this.currentRoundValue;
      } else {
        this.scores.player2 += this.currentRoundValue;
      }
      
      this.resetForNextHand();
      return 'rejected';
    }
  }

  // Adicionar mensagem ao chat
  addChatMessage(playerId, message, type = 'text') {
    this.chat.push({
      playerId,
      message,
      type,
      timestamp: Date.now()
    });
    
    // Manter apenas as últimas 50 mensagens
    if (this.chat.length > 50) {
      this.chat = this.chat.slice(-50);
    }
  }

  // Obter estado do jogo para um jogador
  getGameState(playerId) {
    return {
      roomId: this.roomId,
      gameType: this.gameType,
      betAmount: this.betAmount,
      players: this.players,
      currentPlayerIndex: this.currentPlayerIndex,
      gamePhase: this.gamePhase,
      playerHand: this.playerHands[playerId] || [],
      playedCards: this.playedCards,
      vira: this.vira,
      scores: this.scores,
      currentRoundValue: this.currentRoundValue,
      roundWins: this.roundWins,
      currentRound: this.currentRound,
      trucoState: this.trucoState,
      chat: this.chat.slice(-10) // últimas 10 mensagens
    };
  }
}

io.on('connection', (socket) => {
  console.log(`Usuário conectado: ${socket.id}`);

  // Criar sala
  socket.on('createRoom', ({ betAmount, gameType, playerName }) => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const game = new TrucoGame(roomId, gameType || 'paulista', betAmount);
    game.players.push(socket.id);
    
    rooms[roomId] = {
      game,
      playerNames: { [socket.id]: playerName || 'Jogador 1' },
      bot: null,
      isFreePlay: betAmount === 0
    };
    
    socket.join(roomId);
    socket.emit('roomCreated', { 
      roomId, 
      gameState: game.getGameState(socket.id),
      playerName: playerName || 'Jogador 1'
    });
    
    console.log(`Sala criada: ${roomId} - ${gameType} - R$${betAmount}`);
    
    // Se é jogo gratuito, adicionar bot automaticamente
    if (betAmount === 0) {
      setTimeout(() => {
        addBotToRoom(roomId, socket);
      }, 2000); // Espera 2 segundos para adicionar o bot
    }
  });

  // Entrar na sala
  socket.on('joinRoom', ({ roomId, playerName }) => {
    const room = rooms[roomId];
    if (room && room.game.players.length < 2) {
      room.game.players.push(socket.id);
      room.playerNames[socket.id] = playerName || 'Jogador 2';
      
      socket.join(roomId);
      
      // Iniciar jogo quando 2 jogadores entrarem
      room.game.dealCards();
      
      io.to(roomId).emit('gameStarted', {
        players: room.game.players,
        playerNames: room.playerNames
      });
      
      // Enviar estado do jogo para cada jogador
      room.game.players.forEach(playerId => {
        io.to(playerId).emit('gameState', room.game.getGameState(playerId));
      });
      
    } else {
      socket.emit('roomError', 'Sala cheia ou inexistente');
    }
  });

  // Jogar carta
  socket.on('playCard', ({ roomId, cardIndex }) => {
    const room = rooms[roomId];
    if (!room) return;
    
    const success = room.game.playCard(socket.id, cardIndex);
    if (success) {
      // Atualizar estado para todos os jogadores
      room.game.players.forEach(playerId => {
        io.to(playerId).emit('gameState', room.game.getGameState(playerId));
      });
      
      // Se o jogo terminou
      if (room.game.gamePhase === 'finished') {
        io.to(roomId).emit('gameFinished', {
          winner: room.game.scores.player1 >= 12 ? 'player1' : 'player2',
          finalScores: room.game.scores
        });
      }
    }
  });

  // Pedir truco
  socket.on('requestTruco', ({ roomId, trucoType }) => {
    const room = rooms[roomId];
    if (!room) return;
    
    const success = room.game.requestTruco(socket.id, trucoType);
    if (success) {
      io.to(roomId).emit('trucoRequested', {
        requestedBy: socket.id,
        trucoType,
        value: room.game.trucoState.currentValue
      });
      
      // Atualizar estado
      room.game.players.forEach(playerId => {
        io.to(playerId).emit('gameState', room.game.getGameState(playerId));
      });
    }
  });

  // Responder truco
  socket.on('respondTruco', ({ roomId, response }) => {
    const room = rooms[roomId];
    if (!room) return;
    
    const result = room.game.respondTruco(socket.id, response);
    if (result) {
      io.to(roomId).emit('trucoResponse', {
        respondedBy: socket.id,
        response,
        result
      });
      
      // Atualizar estado
      room.game.players.forEach(playerId => {
        io.to(playerId).emit('gameState', room.game.getGameState(playerId));
      });
    }
  });

  // Chat
  socket.on('sendMessage', ({ roomId, message }) => {
    const room = rooms[roomId];
    if (!room) return;
    
    room.game.addChatMessage(socket.id, message, 'text');
    io.to(roomId).emit('chatMessage', {
      playerId: socket.id,
      playerName: room.playerNames[socket.id],
      message,
      type: 'text',
      timestamp: Date.now()
    });
  });

  // Emoji
  socket.on('sendEmoji', ({ roomId, emoji }) => {
    const room = rooms[roomId];
    if (!room) return;
    
    room.game.addChatMessage(socket.id, emoji, 'emoji');
    io.to(roomId).emit('chatMessage', {
      playerId: socket.id,
      playerName: room.playerNames[socket.id],
      message: emoji,
      type: 'emoji',
      timestamp: Date.now()
    });
  });

  // Desconexão
  socket.on('disconnect', () => {
    console.log(`Usuário desconectado: ${socket.id}`);
    
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const playerIndex = room.game.players.indexOf(socket.id);
      
      if (playerIndex !== -1) {
        // Notificar outro jogador sobre desconexão
        io.to(roomId).emit('playerDisconnected', {
          playerId: socket.id,
          playerName: room.playerNames[socket.id]
        });
        
        // Remover sala após desconexão
        delete rooms[roomId];
        break;
      }
    }
  });
});

http.listen(PORT, () => {
  console.log(`Servidor Truco rodando na porta ${PORT}`);
});