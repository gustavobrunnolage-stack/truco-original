const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const PORT = process.env.PORT || 3000;

let rooms = {};

app.use(express.static('public'));

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
      playerNames: { [socket.id]: playerName || 'Jogador 1' }
    };
    
    socket.join(roomId);
    socket.emit('roomCreated', { 
      roomId, 
      gameState: game.getGameState(socket.id),
      playerName: playerName || 'Jogador 1'
    });
    
    console.log(`Sala criada: ${roomId} - ${gameType} - R$${betAmount}`);
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