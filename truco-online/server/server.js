const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const PORT = process.env.PORT || 3000;

let rooms = {};

app.use(express.static('public'));

io.on('connection', (socket) => {
  console.log(`Usuário conectado: ${socket.id}`);

  socket.on('createRoom', ({betAmount}) => {
    const roomId = Math.random().toString(36).substring(2, 8);
    rooms[roomId] = { players: [socket.id], betAmount };
    socket.join(roomId);
    socket.emit('roomCreated', roomId);
    console.log(`Sala criada: ${roomId} com aposta de R$${betAmount}`);
  });

  socket.on('joinRoom', (roomId) => {
    if (rooms[roomId] && rooms[roomId].players.length < 2) {
      rooms[roomId].players.push(socket.id);
      socket.join(roomId);
      io.to(roomId).emit('startGame', { roomId, players: rooms[roomId].players });
    } else {
      socket.emit('roomError', 'Sala cheia ou inexistente');
    }
  });

  socket.on('disconnect', () => {
    console.log(`Usuário desconectado: ${socket.id}`);
    for (const roomId in rooms) {
      const index = rooms[roomId].players.indexOf(socket.id);
      if (index !== -1) {
        rooms[roomId].players.splice(index, 1);
        if (rooms[roomId].players.length === 0) {
          delete rooms[roomId];
        }
      }
    }
  });
});

http.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});