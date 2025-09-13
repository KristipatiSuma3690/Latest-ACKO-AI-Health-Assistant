class VoiceHealthAssistant {
    constructor() {
        this.isRecording = false;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.stream = null;
        
        this.recordBtn = document.getElementById('recordBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.status = document.getElementById('status');
        this.messages = document.getElementById('messages');
        
        this.initializeEventListeners();
    }
    
    initializeEventListeners() {
        this.recordBtn.addEventListener('click', () => this.startRecording());
        this.stopBtn.addEventListener('click', () => this.stopRecording());
    }
    
    async startRecording() {
        try {
            // Request microphone access
            this.stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    sampleRate: 16000,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true
                }
            });
            
            // Create MediaRecorder
            this.mediaRecorder = new MediaRecorder(this.stream, {
                mimeType: 'audio/webm;codecs=opus'
            });
            
            this.audioChunks = [];
            
            // Handle data available event
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };
            
            // Handle recording stop
            this.mediaRecorder.onstop = () => {
                this.processAudio();
            };
            
            // Start recording
            this.mediaRecorder.start();
            this.isRecording = true;
            
            // Update UI
            this.updateUI('recording');
            this.updateStatus('🎤 Recording... Speak now!');
            
        } catch (error) {
            console.error('Error starting recording:', error);
            this.updateStatus('❌ Microphone access denied. Please allow microphone access.');
        }
    }
    
    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            
            // Stop all audio tracks
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
            }
            
            // Update UI
            this.updateUI('processing');
            this.updateStatus('⏳ Processing audio...');
        }
    }
    
    async processAudio() {
        try {
            // Create audio blob
            const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
            
            // Convert to WAV format for better compatibility
            const audioBuffer = await this.convertToWav(audioBlob);
            
            // Send to backend
            await this.sendAudioToBackend(audioBuffer);
            
        } catch (error) {
            console.error('Error processing audio:', error);
            this.updateStatus('❌ Error processing audio. Please try again.');
            this.updateUI('ready');
        }
    }
    
    async convertToWav(audioBlob) {
        // For now, we'll send the webm blob directly
        // In production, you might want to convert to WAV
        return audioBlob;
    }
    
    async sendAudioToBackend(audioBlob) {
        try {
            const formData = new FormData();
            formData.append('audio', audioBlob, 'recording.webm');
            
            this.updateStatus('🔄 Transcribing and generating response<span class="loading"></span>');
            
            const response = await fetch('/api/process-audio', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            
            // Display results
            this.displayTranscription(result.transcription);
            this.displayBotResponse(result.follow_up_question);
            
            this.updateStatus('✅ Ready for next recording...');
            this.updateUI('ready');
            
        } catch (error) {
            console.error('Error sending audio to backend:', error);
            
            // Fallback: Try direct local processing
            this.handleOfflineMode(audioBlob);
        }
    }
    
    async handleOfflineMode(audioBlob) {
        try {
            // Use Web Speech API as fallback
            const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
            recognition.lang = 'en-US';
            recognition.continuous = false;
            recognition.interimResults = false;
            
            // Convert blob to audio for speech recognition
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            
            recognition.onresult = (event) => {
                const transcription = event.results[0][0].transcript;
                this.displayTranscription(transcription);
                
                // Generate simple fallback response
                const fallbackResponse = this.generateFallbackResponse(transcription);
                this.displayBotResponse(fallbackResponse);
                
                this.updateStatus('✅ Ready for next recording (offline mode)...');
                this.updateUI('ready');
            };
            
            recognition.onerror = () => {
                this.updateStatus('❌ Speech recognition failed. Please try again.');
                this.updateUI('ready');
            };
            
            // Note: Web Speech API doesn't work directly with blobs
            // This is a simplified fallback - in reality, you'd need server processing
            this.updateStatus('🔄 Using fallback processing...');
            setTimeout(() => {
                this.displayTranscription("I heard your voice but couldn't transcribe it without the server.");
                this.displayBotResponse("Can you tell me more about your symptoms?");
                this.updateStatus('✅ Ready for next recording...');
                this.updateUI('ready');
            }, 2000);
            
        } catch (error) {
            console.error('Offline mode error:', error);
            this.updateStatus('❌ Processing failed. Please check your connection.');
            this.updateUI('ready');
        }
    }
    
    generateFallbackResponse(transcription) {
        const text = transcription.toLowerCase();
        
        if (text.includes('pain') || text.includes('hurt')) {
            return "Can you describe the pain? Is it sharp, dull, or throbbing?";
        } else if (text.includes('fever') || text.includes('temperature')) {
            return "How long have you had the fever? Have you taken your temperature?";
        } else if (text.includes('cough') || text.includes('cold')) {
            return "Is the cough dry or are you bringing up phlegm?";
        } else if (text.includes('headache') || text.includes('head')) {
            return "Where exactly is the headache located? How would you rate the pain from 1-10?";
        } else {
            return "Can you tell me more about when these symptoms started?";
        }
    }
    
    displayTranscription(transcription) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message user-message';
        messageDiv.innerHTML = `
            <div class="message-content">
                <strong>You:</strong> ${transcription}
            </div>
        `;
        this.messages.appendChild(messageDiv);
        this.scrollToBottom();
    }
    
    displayBotResponse(response) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message bot-message';
        messageDiv.innerHTML = `
            <div class="message-content">
                <strong>Dr. AI:</strong> ${response}
            </div>
        `;
        this.messages.appendChild(messageDiv);
        this.scrollToBottom();
    }
    
    updateUI(state) {
        switch (state) {
            case 'recording':
                this.recordBtn.disabled = true;
                this.stopBtn.disabled = false;
                this.recordBtn.classList.add('recording');
                break;
            case 'processing':
                this.recordBtn.disabled = true;
                this.stopBtn.disabled = true;
                this.recordBtn.classList.remove('recording');
                break;
            case 'ready':
                this.recordBtn.disabled = false;
                this.stopBtn.disabled = true;
                this.recordBtn.classList.remove('recording');
                break;
        }
    }
    
    updateStatus(message) {
        this.status.innerHTML = message;
        this.status.className = 'status';
        
        if (message.includes('Recording')) {
            this.status.classList.add('recording');
        } else if (message.includes('Processing') || message.includes('Transcribing')) {
            this.status.classList.add('processing');
        }
    }
    
    scrollToBottom() {
        this.messages.scrollTop = this.messages.scrollHeight;
    }
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new VoiceHealthAssistant();
});
