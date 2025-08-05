#!/usr/bin/env python3
"""
Backend Test for Truco Online Game
Tests Socket.IO endpoints and game functionality
"""

import requests
import socketio
import time
import sys
import threading
from datetime import datetime

class TrucoGameTester:
    def __init__(self, base_url="http://localhost:3000"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.sio1 = None
        self.sio2 = None
        self.room_id = None
        self.game_events = []
        
    def run_test(self, name, test_func):
        """Run a single test"""
        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            success = test_func()
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - {name}")
            else:
                print(f"❌ Failed - {name}")
            return success
        except Exception as e:
            print(f"❌ Failed - {name}: {str(e)}")
            return False

    def test_server_health(self):
        """Test if server is responding"""
        try:
            response = requests.get(self.base_url, timeout=5)
            return response.status_code == 200
        except Exception:
            return False

    def test_static_files(self):
        """Test if static files are served correctly"""
        try:
            # Test main HTML file
            response = requests.get(self.base_url, timeout=5)
            if response.status_code != 200:
                return False
            
            # Test CSS file
            css_response = requests.get(f"{self.base_url}/style.css", timeout=5)
            if css_response.status_code != 200:
                return False
                
            # Test JS file
            js_response = requests.get(f"{self.base_url}/script.js", timeout=5)
            if js_response.status_code != 200:
                return False
                
            return True
        except Exception:
            return False

    def test_socket_connection(self):
        """Test Socket.IO connection"""
        try:
            self.sio1 = socketio.Client()
            
            @self.sio1.event
            def connect():
                self.game_events.append('player1_connected')
            
            @self.sio1.event
            def disconnect():
                self.game_events.append('player1_disconnected')
            
            self.sio1.connect(self.base_url)
            time.sleep(1)
            
            return 'player1_connected' in self.game_events
        except Exception:
            return False

    def test_room_creation(self):
        """Test room creation functionality"""
        try:
            if not self.sio1:
                return False
            
            room_created = False
            
            @self.sio1.event
            def roomCreated(data):
                nonlocal room_created
                self.room_id = data.get('roomId')
                room_created = True
                self.game_events.append(f'room_created_{self.room_id}')
            
            # Create room
            self.sio1.emit('createRoom', {
                'playerName': 'TestPlayer1',
                'gameType': 'paulista',
                'betAmount': 10.0
            })
            
            # Wait for response
            time.sleep(2)
            
            return room_created and self.room_id is not None
        except Exception:
            return False

    def test_room_joining(self):
        """Test joining a room"""
        try:
            if not self.room_id:
                return False
            
            self.sio2 = socketio.Client()
            game_started = False
            
            @self.sio2.event
            def connect():
                self.game_events.append('player2_connected')
            
            @self.sio2.event
            def gameStarted(data):
                nonlocal game_started
                game_started = True
                self.game_events.append('game_started')
            
            self.sio2.connect(self.base_url)
            time.sleep(1)
            
            # Join room
            self.sio2.emit('joinRoom', {
                'roomId': self.room_id,
                'playerName': 'TestPlayer2'
            })
            
            # Wait for game to start
            time.sleep(3)
            
            return game_started
        except Exception:
            return False

    def test_game_state_updates(self):
        """Test if game state updates are received"""
        try:
            game_state_received = False
            
            @self.sio1.event
            def gameState(data):
                nonlocal game_state_received
                game_state_received = True
                self.game_events.append('game_state_received')
            
            # Wait for game state
            time.sleep(2)
            
            return game_state_received
        except Exception:
            return False

    def test_chat_functionality(self):
        """Test chat message sending"""
        try:
            if not self.room_id:
                return False
            
            chat_received = False
            
            @self.sio2.event
            def chatMessage(data):
                nonlocal chat_received
                if data.get('message') == 'Test message':
                    chat_received = True
                    self.game_events.append('chat_received')
            
            # Send chat message
            self.sio1.emit('sendMessage', {
                'roomId': self.room_id,
                'message': 'Test message'
            })
            
            time.sleep(2)
            
            return chat_received
        except Exception:
            return False

    def test_emoji_functionality(self):
        """Test emoji sending"""
        try:
            if not self.room_id:
                return False
            
            emoji_received = False
            
            @self.sio2.event
            def chatMessage(data):
                nonlocal emoji_received
                if data.get('message') == '😀' and data.get('type') == 'emoji':
                    emoji_received = True
                    self.game_events.append('emoji_received')
            
            # Send emoji
            self.sio1.emit('sendEmoji', {
                'roomId': self.room_id,
                'emoji': '😀'
            })
            
            time.sleep(2)
            
            return emoji_received
        except Exception:
            return False

    def cleanup(self):
        """Clean up connections"""
        try:
            if self.sio1:
                self.sio1.disconnect()
            if self.sio2:
                self.sio2.disconnect()
        except Exception:
            pass

    def run_all_tests(self):
        """Run all tests"""
        print("🎮 Starting Truco Online Backend Tests")
        print("=" * 50)
        
        # Basic server tests
        self.run_test("Server Health Check", self.test_server_health)
        self.run_test("Static Files Serving", self.test_static_files)
        
        # Socket.IO tests
        self.run_test("Socket.IO Connection", self.test_socket_connection)
        self.run_test("Room Creation", self.test_room_creation)
        self.run_test("Room Joining", self.test_room_joining)
        self.run_test("Game State Updates", self.test_game_state_updates)
        
        # Communication tests
        self.run_test("Chat Functionality", self.test_chat_functionality)
        self.run_test("Emoji Functionality", self.test_emoji_functionality)
        
        # Cleanup
        self.cleanup()
        
        # Print results
        print("\n" + "=" * 50)
        print(f"📊 Test Results: {self.tests_passed}/{self.tests_run} tests passed")
        print(f"🎯 Success Rate: {(self.tests_passed/self.tests_run)*100:.1f}%")
        
        if self.game_events:
            print(f"\n📝 Game Events Captured: {len(self.game_events)}")
            for event in self.game_events:
                print(f"   - {event}")
        
        return self.tests_passed == self.tests_run

def main():
    """Main test function"""
    tester = TrucoGameTester()
    
    try:
        success = tester.run_all_tests()
        return 0 if success else 1
    except KeyboardInterrupt:
        print("\n⚠️ Tests interrupted by user")
        tester.cleanup()
        return 1
    except Exception as e:
        print(f"\n❌ Test suite failed: {str(e)}")
        tester.cleanup()
        return 1

if __name__ == "__main__":
    sys.exit(main())