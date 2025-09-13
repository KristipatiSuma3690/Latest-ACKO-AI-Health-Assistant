from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import sys
import tempfile
import io
import speech_recognition as sr
from datetime import datetime
import uuid

# Add the .venv directory to Python path to import your model
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), '.venv'))
import model

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Configure upload settings
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# In-memory conversation storage (in production, use a database)
conversation_sessions = {}

@app.route('/')
def index():
    """Serve the main HTML file"""
    return send_from_directory('frontend', 'index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    """Serve static files (CSS, JS)"""
    return send_from_directory('frontend', filename)

# @app.route('/api/process-audio', methods=['POST'])
# def process_audio():
#     """Process uploaded audio file and return transcription + follow-up question"""
#     try:
#         # Check if audio file is present
#         if 'audio' not in request.files:
#             return jsonify({'error': 'No audio file provided'}), 400
        
#         audio_file = request.files['audio']
#         if audio_file.filename == '':
#             return jsonify({'error': 'No audio file selected'}), 400
        
#         # Process the audio
#         transcription = transcribe_audio_file(audio_file)
        
#         if not transcription or transcription.strip() == "":
#             return jsonify({
#                 'error': 'Could not transcribe audio',
#                 'transcription': '',
#                 'follow_up_question': 'I couldn\'t hear you clearly. Could you please repeat what you said?'
#             }), 200
        
#         # Generate follow-up question using your existing model
#         print(f"Transcribed text: {transcription}")
#         follow_up_question = model.generate_reflective_questions_with_retry(transcription)
        
#         return jsonify({
#             'success': True,
#             'transcription': transcription,
#             'follow_up_question': follow_up_question
#         })
        
#     except Exception as e:
#         print(f"Error processing audio: {str(e)}")
#         return jsonify({
#             'error': f'Server error: {str(e)}',
#             'transcription': '',
#             'follow_up_question': 'I encountered an error processing your request. Could you please try again?'
#         }), 500

@app.route('/api/start-session', methods=['POST'])
def start_session():
    """Start a new conversation session"""
    try:
        data = request.get_json()
        session_id = str(uuid.uuid4())
        
        conversation_sessions[session_id] = {
            'session_id': session_id,
            'started_at': datetime.now().isoformat(),
            'language': data.get('language', 'en-US'),
            'patient_info': data.get('patient_info', {}),
            'conversation_history': [],
            'emotion_timeline': [],
            'key_symptoms': [],
            'doctor_notes': []
        }
        
        return jsonify({
            'success': True,
            'session_id': session_id,
            'message': 'New consultation session started'
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/get-session/<session_id>', methods=['GET'])
def get_session(session_id):
    """Get conversation session details"""
    try:
        if session_id not in conversation_sessions:
            return jsonify({'error': 'Session not found'}), 404
        
        session = conversation_sessions[session_id]
        
        # Generate summary if conversation exists
        summary = None
        if len(session['conversation_history']) > 0:
            summary = model.generate_conversation_summary(
                session['conversation_history'], 
                session['emotion_timeline'],
                session['language']
            )
        
        return jsonify({
            'success': True,
            'session': session,
            'summary': summary
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/generate-question', methods=['POST'])
def generate_question():
    """Generate a follow-up question based on transcribed text with conversation context"""
    try:
        # Get the transcribed text from the request
        data = request.get_json()
        
        if not data or 'text' not in data:
            return jsonify({'error': 'No text provided'}), 400
        
        transcription = data['text'].strip()
        language = data.get('language', 'en-US')
        session_id = data.get('session_id')  # Optional session tracking
        speaker = data.get('speaker', 'patient')  # 'patient' or 'doctor'
        
        if not transcription:
            return jsonify({
                'error': 'Empty text provided',
                'transcription': '',
                'follow_up_question': 'I couldn\'t hear you clearly. Could you please repeat what you said?'
            }), 200
        
        # Get or create session
        session = None
        if session_id and session_id in conversation_sessions:
            session = conversation_sessions[session_id]
        
        # Analyze emotion for patient speech
        emotion_analysis = None
        if speaker == 'patient':
            try:
                emotion_analysis = model.detect_emotion_sentiment(transcription)
                print(f"🧠 Emotion Analysis: {emotion_analysis}")
                
                # Add to emotion timeline if session exists
                if session:
                    session['emotion_timeline'].append({
                        'timestamp': datetime.now().isoformat(),
                        'emotion': emotion_analysis['primary_emotion'],
                        'alert_level': emotion_analysis['alert_level'],
                        'sentiment_score': emotion_analysis['sentiment_score'],
                        'text': transcription
                    })
                    
            except Exception as e:
                print(f"⚠️ Emotion analysis failed: {e}")
                emotion_analysis = {
                    'primary_emotion': 'neutral',
                    'alert_level': 'NONE',
                    'recommendations': ['✅ Patient emotional state appears stable'],
                    'vader_scores': {'compound': 0.0, 'neg': 0.0, 'neu': 1.0, 'pos': 0.0}
                }
        
        # Add to conversation history if session exists
        if session:
            session['conversation_history'].append({
                'timestamp': datetime.now().isoformat(),
                'speaker': speaker,
                'text': transcription,
                'emotion_analysis': emotion_analysis
            })
        
        # Generate follow-up question with conversation context
        conversation_context = session['conversation_history'] if session else []
        
        print(f"📝 Transcribed text: {transcription}")
        print(f"🌐 Language: {language}")
        print(f"💬 Conversation history length: {len(conversation_context)}")
        
        follow_up_question = model.generate_reflective_questions_with_retry(
            transcription, 
            language=language,
            conversation_history=conversation_context,
            emotion_analysis=emotion_analysis
        )
        
        # Generate summary if significant conversation exists
        summary = None
        if session and len(session['conversation_history']) >= 4:  # At least 2 exchanges
            summary = model.generate_conversation_summary(
                session['conversation_history'][-10:],  # Last 10 entries
                session['emotion_timeline'][-5:],       # Last 5 emotions
                language
            )
        
        response_data = {
            'success': True,
            'transcription': transcription,
            'follow_up_question': follow_up_question,
            'session_id': session_id,
            'conversation_length': len(conversation_context) if session else 0
        }
        
        # Add emotion analysis for patient speech
        if emotion_analysis:
            response_data['emotion_analysis'] = {
                'primary_emotion': emotion_analysis.get('primary_emotion', 'neutral'),
                'alert_level': emotion_analysis.get('alert_level', 'NONE'),
                'sentiment': emotion_analysis.get('sentiment', 'neutral'),
                'sentiment_score': emotion_analysis.get('sentiment_score', 0.5),
                'recommendations': emotion_analysis.get('recommendations', []),
                'vader_scores': emotion_analysis.get('vader_scores', {}),
                'vader_description': emotion_analysis.get('vader_details', {}).get('description', 'Neutral emotional tone')
            }
        
        # Add summary if available
        if summary:
            response_data['conversation_summary'] = summary
        
        return jsonify(response_data)
        
    except Exception as e:
        print(f"❌ Error generating question: {str(e)}")
        return jsonify({
            'error': f'Server error: {str(e)}',
            'transcription': '',
            'follow_up_question': 'I encountered an error processing your request. Could you please try again?'
        }), 500

@app.route('/api/summarize-conversation/<session_id>', methods=['GET'])
def summarize_conversation(session_id):
    """Generate a comprehensive summary of the conversation"""
    print("Inside summarize_conversation")
    try:
        print("Conversation session: ",conversation_sessions)
        print("Session Id: ",session_id)
        if session_id not in conversation_sessions:
            return jsonify({'error': 'Session not found'}), 404
        
        session = conversation_sessions[session_id]
        print("Conversation_history: ",session);
        if len(session['conversation_history']) == 0:
            return jsonify({
                'success': True,
                'summary': 'No conversation to summarize yet.'
            })
        
        # Generate comprehensive summary
        summary = model.generate_conversation_summary(
            session['conversation_history'],
            session['emotion_timeline'],
            session['language'],
            summary_type='comprehensive'
        )
        
        # Generate key insights
        insights = model.extract_conversation_insights(
            session['conversation_history'],
            session['emotion_timeline'],
            session['language']
        )
        
        return jsonify({
            'success': True,
            'session_id': session_id,
            'summary': summary,
            'insights': insights,
            'conversation_stats': {
                'total_exchanges': len(session['conversation_history']),
                'patient_statements': len([h for h in session['conversation_history'] if h['speaker'] == 'patient']),
                'doctor_questions': len([h for h in session['conversation_history'] if h['speaker'] == 'doctor']),
                'emotion_alerts': len([e for e in session['emotion_timeline'] if e['alert_level'] != 'NONE']),
                'duration': session['started_at']
            }
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# def transcribe_audio_file(audio_file):
#     """Transcribe audio file using speech recognition"""
#     try:
#         # Create a temporary file
#         with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp_file:
#             temp_path = temp_file.name
            
#             # Read the uploaded file data
#             audio_data = audio_file.read()
            
#             # Save the audio data to temporary file
#             with open(temp_path, 'wb') as f:
#                 f.write(audio_data)
            
#             # Use speech recognition
#             r = sr.Recognizer()
            
#             # Try to read as WAV first
#             try:
#                 with sr.AudioFile(temp_path) as source:
#                     # Adjust for ambient noise
#                     r.adjust_for_ambient_noise(source, duration=0.5)
#                     audio = r.record(source)
#             except Exception as wav_error:
#                 print(f"WAV reading failed: {wav_error}")
#                 # If WAV fails, try using your model's transcribe_audio function
#                 try:
#                     # Read raw audio data and create AudioData object
#                     import wave
#                     with wave.open(temp_path, 'rb') as wav_file:
#                         frames = wav_file.readframes(wav_file.getnframes())
#                         audio = sr.AudioData(frames, wav_file.getframerate(), wav_file.getsampwidth())
#                 except Exception as e:
#                     print(f"Audio processing error: {e}")
#                     return ""
            
#             try:
#                 # Try Google Speech Recognition first
#                 text = r.recognize_google(audio)
#                 return text
#             except sr.UnknownValueError:
#                 print("Google Speech Recognition could not understand audio")
#                 return ""
#             except sr.RequestError as e:
#                 print(f"Could not request results from Google Speech Recognition; {e}")
#                 return ""
            
#     except Exception as e:
#         print(f"Transcription error: {e}")
#         return ""
    
#     finally:
#         # Clean up temporary file
#         try:
#             if 'temp_path' in locals():
#                 os.unlink(temp_path)
#         except:
#             pass

# @app.route('/api/health', methods=['GET'])
# def health_check():
#     """Health check endpoint"""
#     return jsonify({'status': 'healthy', 'message': 'Voice Health Assistant API is running'})

# @app.route('/api/test-model', methods=['POST'])
# def test_model():
#     """Test the model with a sample text"""
#     try:
#         data = request.get_json()
#         text = data.get('text', 'I have a headache')
        
#         follow_up = model.generate_reflective_questions_with_retry(text)
        
#         return jsonify({
#             'input': text,
#             'follow_up_question': follow_up
#         })
    
#     except Exception as e:
#         return jsonify({'error': str(e)}), 500

# @app.route('/api/stream-audio', methods=['POST'])
# def stream_audio():
#     """Handle real-time audio streaming (alternative approach)"""
#     try:
#         # This endpoint can be used for real-time audio processing
#         # similar to your main.py approach but via web interface
        
#         # For now, return a simple response
#         return jsonify({
#             'message': 'Streaming endpoint ready',
#             'status': 'available'
#         })
    
#     except Exception as e:
#         return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    print("🚀 Starting Voice Health Assistant Server...")
    print("📱 Frontend will be available at: http://localhost:5000")
    print("🔊 Make sure your microphone is connected and working!")
    print("🤖 AI model ready with Google Gemini integration!")
    print("⚕️ Ready to assist with health consultations...")
    
    # Check if model is accessible
    try:
        test_response = model.get_fallback_question("test")
        print("✅ Model connection successful!")
    except Exception as e:
        print(f"⚠️ Model connection issue: {e}")
    
    # Run the Flask app
    app.run(debug=True, host='0.0.0.0', port=5000)
