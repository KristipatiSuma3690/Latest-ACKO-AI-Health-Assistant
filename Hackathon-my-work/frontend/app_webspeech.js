class VoiceHealthAssistant {
    constructor() {
        this.isRecording = false;
        this.recognition = null;
        this.currentTranscription = '';
        this.liveTranscriptionElement = null;
        this.speechSynthesis = window.speechSynthesis;
        this.currentUtterance = null;
        this.currentLanguage = 'en-US'; // Default language
        this.sessionId = null; // Track conversation session
        this.conversationHistory = []; // Local conversation tracking
        
        // Patient-only recording mode
        this.isPatientMode = true; // Only capture patient speech
        this.patientMicEnabled = false; // Track if patient microphone is active
        this.doctorNotesMode = false; // For manual doctor notes
        
        this.recordBtn = document.getElementById("recordBtn");
    this.audioWave = document.getElementById("audioWave");
    this.stopBtn = document.getElementById("stopBtn");
    this.status = document.getElementById("status");
    this.messages = document.getElementById("messages");
    this.emotionAlerts = document.getElementById("emotionAlerts");
    this.summaryBtn = document.getElementById("summaryBtn");
        
        this.initializeSpeechRecognition();
        this.initializeEventListeners();
        this.initializeTextToSpeech();
        this.startNewSession(); // Start a new conversation session
    }
    
    initializeSpeechRecognition() {
        // Check if Web Speech API is supported
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            this.updateStatus('❌ Speech recognition not supported in this browser. Try Chrome or Edge.');
            this.recordBtn.disabled = true;
            return;
        }
        
        // Initialize speech recognition
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();
        
        // Configure recognition settings for better detection
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = this.currentLanguage;
        this.recognition.maxAlternatives = 1;
        
        // Handle recognition results
        this.recognition.onresult = (event) => {
            let finalTranscript = '';
            let interimTranscript = '';
            
            // Process all results
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }
            
            // Update current transcription with final results
            if (finalTranscript) {
                this.currentTranscription += finalTranscript;
            }
            
            // Update live transcription display
            // this.createLiveTranscriptionElement(this.currentTranscription + interimTranscript);
            this.updateLiveTranscription(this.currentTranscription+interimTranscript);
            // Update status with shorter message
            const displayText = (this.currentTranscription + interimTranscript).trim();
            if (displayText) {
                this.updateStatus(`🎤 Speaking: "${displayText.length > 50 ? displayText.substring(0, 50) + '...' : displayText}"`);
            } else {
                this.updateStatus('🎤 Listening... Speak clearly into your microphone!');
            }
        };
        
        // Handle recognition errors
        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            
            switch (event.error) {
                case 'no-speech':
                    this.updateStatus('🔇 No speech detected. Try speaking louder or closer to the microphone.');
                    // Don't stop recording, just show the message
                    break;
                case 'audio-capture':
                    this.updateStatus('❌ Microphone not accessible. Please check permissions and try again.');
                    this.stopRecording();
                    break;
                case 'not-allowed':
                    this.updateStatus('❌ Microphone permission denied. Please click the microphone icon in your browser and allow access.');
                    this.stopRecording();
                    break;
                case 'network':
                    this.updateStatus('❌ Network error. Please check your internet connection.');
                    this.stopRecording();
                    break;
                case 'aborted':
                    // This happens when stopping normally, ignore it
                    break;
                default:
                    this.updateStatus(`❌ Recognition error: ${event.error}. Please try again.`);
                    this.stopRecording();
            }
        };
        
        // Handle recognition end
        this.recognition.onend = () => {
            console.log('Recognition ended. Recording status:', this.isRecording);
            if (this.isRecording) {
                // Recognition ended unexpectedly, try to restart
                console.log('Recognition ended unexpectedly, attempting to restart...');
                setTimeout(() => {
                    if (this.isRecording) {
                        try {
                            this.recognition.start();
                        } catch (e) {
                            console.error('Failed to restart recognition:', e);
                            this.updateStatus('❌ Recording stopped unexpectedly. Please try again.');
                            this.stopRecording();
                        }
                    }
                }, 100);
            }
        };
        
        // Handle recognition start
        this.recognition.onstart = () => {
            console.log('Speech recognition started successfully');
            this.updateStatus('🎤 Listening... Speak clearly into your microphone!');
        };
    }
    
    initializeEventListeners() {
        this.recordBtn.addEventListener('click', () => this.startRecording());
        this.stopBtn.addEventListener('click', () => this.stopRecording());
    }

    updateLiveTranscription(text) {
        if (this.liveTranscriptionElement) {
            const liveTextElement = this.liveTranscriptionElement.querySelector('.live-text');
            if (liveTextElement) {
                liveTextElement.textContent = text.trim() || 'Listening...';
            }
            this.scrollToBottom();
        }
    }
    
    initializeTextToSpeech() {
        // Check if text-to-speech is supported
        if (!('speechSynthesis' in window)) {
            console.warn('Text-to-speech not supported in this browser');
            return;
        }
        
        // Set up default voice preferences
        this.speechSynthesis.onvoiceschanged = () => {
            const voices = this.speechSynthesis.getVoices();
            console.log('Available voices:', voices.length);
        };
    }
    
    async startRecording() {
        const audioWave = document.getElementById("audioWave");

        if (!this.recognition) {
            this.updateStatus('❌ Speech recognition not available');
            return;
        }
        
        try {
            // Test microphone access first
            this.updateStatus('🔍 Testing microphone access...');
            
            // Request microphone permission explicitly
            await navigator.mediaDevices.getUserMedia({ audio: true });
            
            this.currentTranscription = '';
            this.isRecording = true;
            
            if (audioWave) {
        audioWave.style.display = "block";
      }

            // Create live transcription element
            this.createLiveTranscriptionElement();
            // this.updateLiveTranscription();
            
            // Start speech recognition
            this.recognition.start();
            
            // Update UI
            this.updateUI('recording');
            
        } catch (error) {
            console.error('Error starting recording:', error);
            
            if (error.name === 'NotAllowedError') {
                this.updateStatus('❌ Microphone permission denied. Please allow microphone access and try again.');
            } else if (error.name === 'NotFoundError') {
                this.updateStatus('❌ No microphone found. Please connect a microphone and try again.');
            } else {
                this.updateStatus('❌ Failed to start recording. Please check your microphone and try again.');
            }
            
            this.isRecording = false;
            this.updateUI('ready');
        }
        console.log("recording", this.isRecording);
    if (this.isRecording) {
      this.audioWave.style.display = "inline-block"; // show animation
      this.recordBtn.querySelector(".btn-content").textContent = "";
    }
    }
    
    stopRecording() {
        if (this.recognition && this.isRecording) {
            this.audioWave.style.display = "none"; // show animation
      this.recordBtn.querySelector(".btn-content").textContent =
        "🎤 Start Recording";
      this.recordBtn.querySelector(".btn-content").style.display = "flex"; // show record button
            this.isRecording = false;
            this.recognition.stop();
            
            // Update UI
            this.updateUI('processing');
            this.updateStatus('⏳ Processing your response...');
            
            // Process the transcription
            setTimeout(() => {
                this.processTranscription();
            }, 500);
        }
    }
    
    createLiveTranscriptionElement() {
        // Remove any existing live transcription
        this.removeLiveTranscriptionElement();
        
        // Create new live transcription element
        this.liveTranscriptionElement = document.createElement('div');
        this.liveTranscriptionElement.className = 'message user-message live-transcription';
        this.liveTranscriptionElement.innerHTML = `
            <div class="message-content">
                <strong>Live Transcription: </strong> <span class="live-text">Start speaking...</span>
                <div class="live-indicator">🎤 Live</div>
            </div>
        `;
        this.messages.appendChild(this.liveTranscriptionElement);
        this.scrollToBottom();
    }
    
    
    removeLiveTranscriptionElement() {
        if (this.liveTranscriptionElement) {
            this.liveTranscriptionElement.remove();
            this.liveTranscriptionElement = null;
        }
    }
    
    async processTranscription() {
        try {
            const transcription = this.currentTranscription.trim();
            
            if (!transcription) {
                // Remove live transcription and show error
                this.removeLiveTranscriptionElement();
                this.updateStatus('❌ No speech detected. Please try again.');
                this.updateUI('ready');
                return;
            }
            
            // Convert live transcription to final message
            this.finalizeLiveTranscription(transcription);
            
            // Add to local conversation history
            this.conversationHistory.push({
                timestamp: new Date().toISOString(),
                speaker: 'patient',
                text: transcription
            });
            
            // Send to backend for AI processing
            this.updateStatus('🤖 Generating AI response<span class="loading"></span>');
            
            const response = await fetch('/api/generate-question', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: transcription,
                    language: this.currentLanguage,
                    session_id: this.sessionId,
                    speaker: 'patient'
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            
            // Display emotion analysis if available
            if (result.emotion_analysis) {
                console.log('📊 Emotion analysis received:', result.emotion_analysis);
                this.displayEmotionAlert(result.emotion_analysis);
            } else {
                console.log('❌ No emotion analysis in API response');
            }
            
            // Display AI response and add to conversation history
            this.displayBotResponse(result.follow_up_question);
            this.conversationHistory.push({
                timestamp: new Date().toISOString(),
                speaker: 'doctor',
                text: result.follow_up_question
            });
            
            // Show conversation summary if available
            if (result.conversation_summary) {
                this.displayConversationSummary(result.conversation_summary);
            }
            
            // Update conversation counter
            this.updateConversationStats(result.conversation_length || this.conversationHistory.length);
            
            this.updateStatus('✅ Ready for next recording...');
            this.updateUI('ready');
            
        } catch (error) {
            console.error('Error processing transcription:', error);
            
            // Finalize live transcription even on error
            if (this.currentTranscription.trim()) {
                this.finalizeLiveTranscription(this.currentTranscription.trim());
            } else {
                this.removeLiveTranscriptionElement();
            }
            
            // Fallback response
            const fallbackResponse = this.generateFallbackResponse(this.currentTranscription);
            this.displayBotResponse(fallbackResponse);
            
            this.updateStatus('⚠️ Used offline response. Ready for next recording...');
            this.updateUI('ready');
        }
    }
    
    finalizeLiveTranscription(transcription) {
        if (this.liveTranscriptionElement) {
            // Update the live transcription to final format
            this.liveTranscriptionElement.className = 'message user-message';
            this.liveTranscriptionElement.innerHTML = `
                <div class="message-content">
                    <strong>Live Transcription:</strong> ${transcription}
                </div>
                <div class="message-time">${new Date().toLocaleTimeString()}</div>
            `;
            this.liveTranscriptionElement = null;
            this.scrollToBottom();
        }
    }
    
    generateFallbackResponse(transcription) {
        const text = transcription.toLowerCase();
        
        let questions = [];
        
        if (text.includes('pain') || text.includes('hurt') || text.includes('ache')) {
            questions = [
                "Can you describe the pain? Is it sharp, dull, or throbbing?",
                "Where exactly do you feel the pain?",
                "On a scale of 1-10, how would you rate the pain intensity?"
            ];
        } else if (text.includes('fever') || text.includes('temperature') || text.includes('hot')) {
            questions = [
                "How long have you had the fever?",
                "Have you taken your temperature? What was the reading?",
                "Are you experiencing any other symptoms along with the fever?"
            ];
        } else if (text.includes('cough') || text.includes('cold') || text.includes('throat')) {
            questions = [
                "Is the cough dry or are you bringing up phlegm?",
                "Are you experiencing any shortness of breath?",
                "Do you have a sore throat or runny nose as well?"
            ];
        } else if (text.includes('headache') || text.includes('head') || text.includes('dizzy')) {
            questions = [
                "Where exactly is the headache located?",
                "How would you rate the pain from 1-10?",
                "Are you experiencing any nausea or sensitivity to light?"
            ];
        } else if (text.includes('stomach') || text.includes('nausea') || text.includes('sick')) {
            questions = [
                "When did the stomach issues start?",
                "Are you experiencing any vomiting or diarrhea?",
                "What did you eat in the last 24 hours?"
            ];
        } else if (text.includes('tired') || text.includes('fatigue') || text.includes('energy')) {
            questions = [
                "How long have you been feeling tired?",
                "Are you getting enough sleep at night?",
                "Have you noticed any other symptoms along with the fatigue?"
            ];
        } else if (text.includes('stress') || text.includes('anxiety') || text.includes('worried')) {
            questions = [
                "What's been causing you stress lately?",
                "How has this been affecting your daily activities?",
                "Are you experiencing any physical symptoms related to stress?"
            ];
        } else {
            questions = [
                "Thank you for sharing that. Can you tell me more about when these symptoms started?",
                "How are these symptoms affecting your daily routine?",
                "Have you tried any treatments or remedies so far?"
            ];
        }
        
        // Format as numbered list
        return questions.map((q, index) => `${index + 1}. ${q}`).join('\n');
    }
    
    displayTranscription(transcription) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message user-message';
        messageDiv.innerHTML = `
            <div class="message-content">
                <strong></strong> ${transcription}
            </div>
            <div class="message-time">${new Date().toLocaleTimeString()}</div>
        `;
        this.messages.appendChild(messageDiv);
        this.scrollToBottom();
    }
    
    displayBotResponse(response) {
        // Check if response contains multiple numbered questions
        const isMultipleQuestions = response.includes('1.') && response.includes('2.');
        
        let formattedResponse = response;
        if (isMultipleQuestions) {
            // Format multiple questions for better display
            const questions = response.split('\n').filter(line => line.trim());
            formattedResponse = `
                <div class="multiple-questions">
                    <div class="questions-header">📋 <strong>Follow-up Questions from Dr. AI:</strong></div>
                    <ol class="questions-list">
                        ${questions.map(q => {
                            // Remove number prefix if it exists (1., 2., etc.)
                            const cleanQuestion = q.replace(/^\d+\.\s*/, '').trim();
                            return `<li>${cleanQuestion}</li>`;
                        }).join('')}
                    </ol>
                </div>
            `;
        } else {
            formattedResponse = `<strong>AI:</strong> ${response}`;
        }
        
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message bot-message';
        messageDiv.innerHTML = `
            <div class="message-content">
                ${formattedResponse}
                <div class="audio-controls">
                    <button class="speak-btn" onclick="window.voiceAssistant.speakText('${response.replace(/'/g, "\\'")}')">🔊 Play All</button>
                    <button class="stop-speak-btn" onclick="window.voiceAssistant.stopSpeaking()" style="display: none;">⏹️ Stop</button>
                </div>
            </div>
            <div class="message-time">${new Date().toLocaleTimeString()}</div>
        `;
        this.messages.appendChild(messageDiv);
        this.scrollToBottom();
        
        // Automatically speak the response
        this.speakText(response);
    }
    
    speakText(text) {
        // Stop any current speech
        this.stopSpeaking();
        
        if (!this.speechSynthesis) {
            console.warn('Text-to-speech not available');
            return;
        }
        
        // Create new utterance
        this.currentUtterance = new SpeechSynthesisUtterance(text);
        
        // Configure voice settings
        this.currentUtterance.rate = 0.9; // Slightly slower for clarity
        this.currentUtterance.pitch = 1.0;
        this.currentUtterance.volume = 0.8;
        
        // Set language for the utterance
        this.currentUtterance.lang = this.currentLanguage;
        
        // Get appropriate voice for the language
        const voices = this.speechSynthesis.getVoices();
        let selectedVoice = null;
        
        if (this.currentLanguage === 'hi-IN') {
            // Try to find Hindi voice
            selectedVoice = voices.find(voice => 
                voice.lang === 'hi-IN' || 
                voice.lang.startsWith('hi') ||
                voice.name.toLowerCase().includes('hindi')
            );
        } else {
            // Try to find English voice (preferably female for medical context)
            selectedVoice = voices.find(voice => 
                (voice.lang === 'en-US' || voice.lang.startsWith('en')) &&
                (voice.name.toLowerCase().includes('female') || 
                 voice.name.toLowerCase().includes('male')
                )
            );
            
            // Fallback to any English voice
            if (!selectedVoice) {
                selectedVoice = voices.find(voice => 
                    voice.lang === 'en-US' || voice.lang.startsWith('en')
                );
            }
        }
        
        if (selectedVoice) {
            this.currentUtterance.voice = selectedVoice;
            console.log(`🔊 Using voice: ${selectedVoice.name} (${selectedVoice.lang})`);
        } else {
            console.warn(`⚠️ No suitable voice found for language: ${this.currentLanguage}`);
        }
        
        // Handle speech events
        this.currentUtterance.onstart = () => {
            this.updateStatus('🔊 Dr. AI is speaking...');
            this.showStopSpeakButtons();
        };
        
        this.currentUtterance.onend = () => {
            this.updateStatus('✅ Ready for next recording...');
            this.hideStopSpeakButtons();
            this.currentUtterance = null;
        };
        
        this.currentUtterance.onerror = (event) => {
            // console.error('Speech synthesis error:', event);
            this.updateStatus('⚠️ Speech playback failed. Ready for next recording...');
            this.hideStopSpeakButtons();
            this.currentUtterance = null;
        };
        
        // Start speaking
        this.speechSynthesis.speak(this.currentUtterance);
    }
    
    stopSpeaking() {
        if (this.speechSynthesis) {
            this.speechSynthesis.cancel();
        }
        if (this.currentUtterance) {
            this.currentUtterance = null;
        }
        this.hideStopSpeakButtons();
    }
    
    showStopSpeakButtons() {
        const stopButtons = document.querySelectorAll('.stop-speak-btn');
        const playButtons = document.querySelectorAll('.speak-btn');
        stopButtons.forEach(btn => btn.style.display = 'inline-block');
        playButtons.forEach(btn => btn.style.display = 'none');
    }
    
    hideStopSpeakButtons() {
        const stopButtons = document.querySelectorAll('.stop-speak-btn');
        const playButtons = document.querySelectorAll('.speak-btn');
        stopButtons.forEach(btn => btn.style.display = 'none');
        playButtons.forEach(btn => btn.style.display = 'inline-block');
    }
    
    displayEmotionAlert(emotionAnalysis) {
        console.log('🎭 displayEmotionAlert called with:', emotionAnalysis);
        
        const alertLevel = emotionAnalysis.alert_level;
        const primaryEmotion = emotionAnalysis.primary_emotion;
        const recommendations = emotionAnalysis.recommendations;
        const vaderDescription = emotionAnalysis.vader_description || 'Neutral emotional tone';
        const vaderScores = emotionAnalysis.vader_scores || {};
        
        // Only skip alerts if NONE - show LOW, MEDIUM, and HIGH alerts
        if (alertLevel === 'NONE') {
            console.log('🔇 No emotion alert needed - patient state is stable');
            return;
        }
        
        console.log(`🚨 Displaying emotion alert: ${alertLevel} - ${primaryEmotion}`);
        
        // Create emotion alert element
        const alertDiv = document.createElement('div');
        alertDiv.className = `emotion-alert alert-${alertLevel.toLowerCase()}`;
        
        let alertIcon = '';
        let alertTitle = '';
        
        switch (alertLevel) {
            case 'HIGH':
                alertIcon = '🚨';
                alertTitle = 'HIGH PRIORITY ALERT';
                break;
            case 'MEDIUM':
                alertIcon = '⚠️';
                alertTitle = 'ATTENTION NEEDED';
                break;
            case 'LOW':
                alertIcon = '💡';
                alertTitle = 'EMOTIONAL INSIGHT';
                break;
        }
        
        // Format VADER scores for display
        const vaderScoreDisplay = vaderScores.compound ? 
            `Compound: ${(vaderScores.compound).toFixed(2)} | Positive: ${(vaderScores.pos).toFixed(2)} | Negative: ${(vaderScores.neg).toFixed(2)} | Neutral: ${(vaderScores.neu).toFixed(2)}` :
            'Analysis pending...';
        
        alertDiv.innerHTML = `
            <div class="alert-header">
                <span class="alert-icon">${alertIcon}</span>
                <span class="alert-title">${alertTitle}</span>
                <button class="alert-close" onclick="this.parentElement.parentElement.style.animation='slideOutRight 0.3s ease-out'; setTimeout(() => this.parentElement.parentElement.remove(), 300)">×</button>
            </div>
            <div class="alert-content">
                <p><strong>Detected Emotion:</strong> ${primaryEmotion.charAt(0).toUpperCase() + primaryEmotion.slice(1)}</p>
                <p><strong>Sentiment Analysis:</strong> ${emotionAnalysis.sentiment.charAt(0).toUpperCase() + emotionAnalysis.sentiment.slice(1)}</p>
                <p><strong>VADER Assessment:</strong> ${vaderDescription}</p>
                <details class="vader-details">
                    <summary><strong>📊 Sentiment Scores (VADER)</strong></summary>
                    <div class="vader-scores">
                        ${vaderScoreDisplay}
                    </div>
                </details>
                <div class="recommendations">
                    <strong>🎯 Clinical Recommendations:</strong>
                    <ul>
                        ${recommendations.map(rec => `<li>${rec}</li>`).join('')}
                    </ul>
                </div>
            </div>
        `;
        
        // Insert alert in dedicated alerts container (outside chat)
        this.emotionAlerts.appendChild(alertDiv);
        
        // Add visual emphasis for high priority alerts
        if (alertLevel === 'HIGH') {
            alertDiv.style.boxShadow = '0 4px 20px rgba(244, 67, 54, 0.3)';
            // Flash the browser tab for high priority
            this.flashTab('🚨 MEDICAL ALERT');
        }
        
        // Auto-hide low/medium alerts after 15 seconds (increased for VADER info)
        if (alertLevel !== 'HIGH') {
            setTimeout(() => {
                if (alertDiv.parentNode) {
                    alertDiv.style.animation = 'slideOutRight 0.3s ease-out';
                    setTimeout(() => alertDiv.remove(), 300);
                }
            }, 15000);
        }
    }
    
    getSelectedLanguage() {
        // Check if language selector exists
        const languageSelect = document.getElementById('languageSelect');
        if (languageSelect) {
            return languageSelect.value;
        }
        // Default to English (US)
        return 'en-US';
    }
    
    getSupportedLanguages() {
        return [
            { code: 'en-US', name: 'English (United States)' },
            { code: 'en-IN', name: 'English (India)' },
            { code: 'hi-IN', name: 'हिन्दी (Hindi - India)' },
        ];
    }
    
    updateLanguage() {
        if (this.recognition) {
            this.recognition.lang = this.getSelectedLanguage();
            console.log(`🌐 Language updated to: ${this.getSelectedLanguage()}`);
            
            // Update status message in the selected language
            const lang = this.getSelectedLanguage();
            if (lang.startsWith('hi')) {
                this.updateStatus('🎤 तैयार है... रिकॉर्डिंग शुरू करने के लिए बटन दबाएं');
            } else {
                this.updateStatus('🎤 Ready... Click "Start Recording" to begin');
            }
        }
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
        
        if (message.includes('Listening') || message.includes('Recording')) {
            this.status.classList.add('recording');
        } else if (message.includes('Processing') || message.includes('Generating')) {
            this.status.classList.add('processing');
        }
    }
    
    scrollToBottom() {
        this.messages.scrollTop = this.messages.scrollHeight;
    }
    
    setLanguage(langCode) {
        // Update current language
        this.currentLanguage = langCode;
        
        // Update speech recognition language
        if (this.recognition) {
            this.recognition.lang = langCode;
        }
        
        // Update button states
        document.querySelectorAll('.lang-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.lang === langCode) {
                btn.classList.add('active');
            }
        });
        
        // Update initial greeting message
        const greetingMessages = {
            'en-US': "Hello! I'm your ACKO AI health assistant. How can I help you today?",
            'hi-IN': "नमस्ते! मैं आपका ACKO AI स्वास्थ्य सहायक हूँ। आज मैं आपकी कैसे मदद कर सकता हूँ?"
        };
        
        const firstMessage = this.messages.querySelector('.bot-message .message-content');
        if (firstMessage) {
            firstMessage.innerHTML = `<strong>AI:</strong> ${greetingMessages[langCode] || greetingMessages['en-US']}`;
        }
        
        // Update status message
        const languageNames = {
            'en-US': 'English',
            'hi-IN': 'हिन्दी (Hindi)'
        };
        
        this.updateStatus(`🌐 Language changed to ${languageNames[langCode] || langCode}. Ready to listen...`);
        
        console.log(`🌐 Speech recognition language set to: ${langCode}`);
    }
    
    flashTab(alertText) {
        // Flash browser tab for medical alerts
        const originalTitle = document.title;
        let isFlashing = true;
        let flashCount = 0;
        
        const flashInterval = setInterval(() => {
            document.title = isFlashing ? alertText : originalTitle;
            isFlashing = !isFlashing;
            flashCount++;
            
            if (flashCount > 10) { // Flash 5 times
                clearInterval(flashInterval);
                document.title = originalTitle;
            }
        }, 500);
    }
    
    // Session Management Functions
    async startNewSession() {
        try {
            const response = await fetch('/api/start-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    language: this.currentLanguage,
                    patient_info: {}
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                this.sessionId = result.session_id;
                console.log('📝 New session started:', this.sessionId);
                this.updateSessionInfo('Session started');
            }
        } catch (error) {
            console.error('Error starting session:', error);
        }
    }
    
    async generateConversationSummary() {
        if (!this.sessionId) {
            alert('No active session to summarize.');
            return;
        }
        
        try {
            const response = await fetch(`/api/summarize-conversation/${this.sessionId}`);
            // print("summary: ",response)
            if (response.ok) {
                const result = await response.json();
                this.displayComprehensiveSummary(result);
                this.summaryBtn.classList.remove("non-clickable");
                this.summaryBtn.classList.add("clickable");
            } else {
                throw new Error('Failed to generate summary');
            }
        } catch (error) {
            console.error('Error generating summary:', error);
            alert('Failed to generate conversation summary.');
        }
    }
    
    
    displayComprehensiveSummary(summaryData) {
        // Store summary data for download
        this.currentSummaryData = summaryData;
        
        // Create a modal or sidebar for comprehensive summary
        const modal = document.createElement('div');
        modal.className = 'summary-modal';
        modal.innerHTML = `
            <div class="summary-modal-content">
                <div class="summary-modal-header">
                    <h3>📋 Complete Consultation Summary</h3>
                    <button class="close-summary" onclick="this.parentElement.parentElement.parentElement.remove()">×</button>
                </div>
                <div class="summary-modal-body">
                    <div class="summary-section">
                        <h4>💬 Conversation Summary</h4>
                        <p>${summaryData.summary}</p>
                    </div>
                    
                    ${summaryData.insights ? `
                    <div class="summary-section">
                        <h4>🔍 Key Insights</h4>
                        <div class="insights-grid">
                            ${summaryData.insights.symptoms?.length ? `
                                <div class="insight-item">
                                    <strong>🩺 Symptoms:</strong>
                                    <ul>${summaryData.insights.symptoms.map(s => `<li>${s}</li>`).join('')}</ul>
                                </div>
                            ` : ''}
                            
                            ${summaryData.insights.concerns?.length ? `
                                <div class="insight-item">
                                    <strong>😟 Concerns:</strong>
                                    <ul>${summaryData.insights.concerns.map(c => `<li>${c}</li>`).join('')}</ul>
                                </div>
                            ` : ''}
                            
                            ${summaryData.insights.recommendations?.length ? `
                                <div class="insight-item">
                                    <strong>💡 Recommendations:</strong>
                                    <ul>${summaryData.insights.recommendations.map(r => `<li>${r}</li>`).join('')}</ul>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                    ` : ''}
                    
                    ${summaryData.conversation_stats ? `
                    <div class="summary-section">
                        <h4>📊 Conversation Statistics</h4>
                        <div class="stats-grid">
                            <div class="stat-item">
                                <span class="stat-label">Total Exchanges:</span>
                                <span class="stat-value">${summaryData.conversation_stats.total_exchanges}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Patient Statements:</span>
                                <span class="stat-value">${summaryData.conversation_stats.patient_statements}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Emotion Alerts:</span>
                                <span class="stat-value">${summaryData.conversation_stats.emotion_alerts}</span>
                            </div>
                        </div>
                    </div>
                    ` : ''}
                </div>
                <div class="summary-modal-footer">
                    <button class="btn-secondary" onclick="this.parentElement.parentElement.parentElement.remove()">Close</button>
                    <button class="btn-primary" id="downloadBtn-${Date.now()}" onclick="window.voiceAssistant.downloadSummaryData()">Download Report</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }
    
    updateConversationStats(conversationLength) {
        // Update conversation counter in the UI
        const statsElement = document.getElementById('conversationStats') || this.createStatsElement();
        statsElement.textContent = `💬 Exchanges: ${Math.floor(conversationLength / 2)}`;
    }
    
    createStatsElement() {
        const statsElement = document.createElement('div');
        statsElement.id = 'conversationStats';
        statsElement.className = 'conversation-stats';
        
        // Add to the header or status area
        const header = document.querySelector('.header') || document.querySelector('.container');
        if (header) {
            header.appendChild(statsElement);
        }
        
        return statsElement;
    }
    
    updateSessionInfo(message) {
        console.log('📝 Session:', message);
        // Could add a session indicator to the UI here
    }
    
    downloadSummaryData() {
        try {
            if (!this.currentSummaryData) {
                alert('No summary data available for download.');
                return;
            }
            
            // Get current date and time for filename
            const now = new Date();
            const timestamp = now.toISOString().replace(/[:.]/g, '-').split('T')[0];
            const timeStr = now.toLocaleTimeString().replace(/[:.]/g, '-');
            
            // Create comprehensive text content
            const summaryData = this.currentSummaryData;
            
            let content = `
ACKO AI HEALTH ASSISTANT - CONSULTATION SUMMARY
================================================
Date: ${now.toLocaleDateString()}
Time: ${now.toLocaleTimeString()}

CONVERSATION SUMMARY
====================
${summaryData.summary || 'No summary available'}

`;

            // Add insights if available
            if (summaryData.insights) {
                content += `
KEY INSIGHTS
============

`;
                if (summaryData.insights.symptoms && summaryData.insights.symptoms.length > 0) {
                    content += `🩺 SYMPTOMS IDENTIFIED:
${summaryData.insights.symptoms.map(s => `- ${s}`).join('\n')}

`;
                }
                
                if (summaryData.insights.concerns && summaryData.insights.concerns.length > 0) {
                    content += `😟 PATIENT CONCERNS:
${summaryData.insights.concerns.map(c => `- ${c}`).join('\n')}

`;
                }
                
                if (summaryData.insights.recommendations && summaryData.insights.recommendations.length > 0) {
                    content += `💡 CLINICAL RECOMMENDATIONS:
${summaryData.insights.recommendations.map(r => `- ${r}`).join('\n')}

`;
                }
            }

            // Add conversation statistics
            if (summaryData.conversation_stats) {
                content += `
CONSULTATION STATISTICS
=======================
Total Exchanges: ${summaryData.conversation_stats.total_exchanges}
Patient Statements: ${summaryData.conversation_stats.patient_statements}
Doctor Questions: ${summaryData.conversation_stats.doctor_questions}
Emotion Alerts: ${summaryData.conversation_stats.emotion_alerts}

`;
            }

            // Add emotion timeline if available
            const emotionEntries = this.conversationHistory.filter(entry => entry.emotion_analysis);
            if (emotionEntries.length > 0) {
                content += `
EMOTION TIMELINE
================
${emotionEntries.map((entry, index) => 
    `${index + 1}. [${new Date(entry.timestamp).toLocaleTimeString()}] Emotion: ${entry.emotion_analysis.primary_emotion}, Alert: ${entry.emotion_analysis.alert_level}`
).join('\n')}

`;
            }

            content += `
TECHNICAL INFORMATION
=====================
Generated by: ACKO AI Health Assistant
Language: ${this.currentLanguage}
Total Exchanges: ${this.conversationHistory.length}
Report Generated: ${now.toISOString()}

---
This report is for informational purposes only and is not a substitute for professional medical advice.
            `.trim();
            
            // Create and download the file
            const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
            const url = window.URL.createObjectURL(blob);
            
            // Create download link
            const downloadLink = document.createElement('a');
            downloadLink.href = url;
            downloadLink.download = `ACKO_Consultation_Summary_${timestamp}_${timeStr}.txt`;
            
            // Trigger download
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
            
            // Clean up the URL object
            window.URL.revokeObjectURL(url);
            
            // Show success message
            this.updateStatus('✅ Summary downloaded successfully!');
            console.log('📄 Summary downloaded successfully');
            
            // Show temporary success notification
            this.showDownloadNotification('📄 Consultation summary downloaded');
            
        } catch (error) {
            console.error('Error downloading summary:', error);
            alert('Failed to download summary. Please try again.');
        }
    }
    
    showDownloadNotification(message) {
        // Create a temporary notification
        const notification = document.createElement('div');
        notification.className = 'download-notification';
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #28a745;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            z-index: 3000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            font-weight: 500;
            font-size: 14px;
        `;
        
        document.body.appendChild(notification);
        
        // Remove notification after 3 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.opacity = '0';
                notification.style.transform = 'translateX(-50%) translateY(-20px)';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 300);
            }
        }, 3000);
    }
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
    // Check if required elements exist
    const requiredElements = ['recordBtn', 'stopBtn', 'status', 'messages'];
    const missingElements = requiredElements.filter(id => !document.getElementById(id));
    
    if (missingElements.length > 0) {
        console.error('Missing required elements:', missingElements);
        return;
    }
    
    // Initialize the voice assistant
    const voiceAssistant = new VoiceHealthAssistant();
    
    // Make it globally accessible for button clicks
    window.voiceAssistant = voiceAssistant;
    
    console.log('🎤 Voice Health Assistant initialized with Web Speech API');
    console.log('🔊 Text-to-speech enabled for AI responses');
    console.log('💡 This version uses browser speech recognition - no audio file processing needed!');
});
