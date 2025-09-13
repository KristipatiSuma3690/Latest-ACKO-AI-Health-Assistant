import google.generativeai as genai
import os
import speech_recognition as sr
import time
import random
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

def get_api_key():
    """Get API key from environment variable or config file"""
    # First try environment variable
    api_key = "AIzaSyCDP6skQ0VeEoGeGYydZXk4ygxkvh7xeYI"
    return api_key




#This using Gemini API to perform the more complex NLU task of understanding the context and generative a relevant, reflective question


def generate_reflective_questions_with_retry(transcribed_text, max_retries=3, language='en-US', conversation_history=None, emotion_analysis=None, question_count=3):
    """Generate questions with rate limiting and retry logic, considering conversation context"""
    # If emotion_analysis not provided, analyze it
    if emotion_analysis is None and transcribed_text:
        try:
            emotion_analysis = detect_emotion_sentiment(transcribed_text)
            print(f"🧠 Emotion Analysis: {emotion_analysis['primary_emotion']} (Alert: {emotion_analysis['alert_level']})")
        except Exception as e:
            print(f"⚠️ Emotion analysis failed: {e}")
            emotion_analysis = None
    
    for attempt in range(max_retries):
        try:
            # Add delay between requests to respect rate limits
            if attempt > 0:
                delay = min(60, (2 ** attempt) + random.uniform(0, 1))  # Exponential backoff
                print(f"⏳ Rate limit hit, waiting {delay:.1f} seconds before retry {attempt + 1}/{max_retries}...")
                time.sleep(delay)
            
            return generate_reflective_questions(transcribed_text, emotion_analysis, language, conversation_history, question_count)
            
        except Exception as e:
            error_str = str(e)
            if "429" in error_str or "quota" in error_str.lower():
                if attempt < max_retries - 1:
                    print(f"⚠️ Rate limit exceeded (attempt {attempt + 1}/{max_retries})")
                    continue
                else:
                    return get_fallback_questions(transcribed_text, language, question_count)
            else:
                return f"❌ Error: {error_str}"
    
    return get_fallback_questions(transcribed_text, language, question_count)

def generate_reflective_questions(transcribed_text, emotion_analysis=None, language='en-US', conversation_history=None, question_count=1):
    try:
        print("Inside generate_reflective_questions")
        # Check if API key is set
        api_key = get_api_key()
        print("api_key:", api_key)  # Debug print to check the API key value           
        
        genai.configure(api_key=api_key)
        
        # Build conversation context
        conversation_context = ""
        medical_insights = ""
        print(conversation_history)
        if conversation_history and len(conversation_history) > 0:
            # Include recent conversation history (last 8 exchanges for better context)
            recent_history = conversation_history[-10:]
            conversation_context = "\n\nCONVERSATION HISTORY:\n"
            
            # Extract patient statements for medical pattern analysis
            patient_statements = []
            for entry in recent_history:
                speaker_label = "Patient" if entry['speaker'] == 'patient' else "Doctor"
                # if language == 'hi-IN':
                #     speaker_label = "मरीज़" if entry['speaker'] == 'patient' else "डॉक्टर"
                conversation_context += f"{speaker_label}: {entry['text']}\n"
                
                if entry['speaker'] == 'patient':
                    patient_statements.append(entry['text'])
            
            # Analyze medical patterns from patient statements
            if patient_statements:
                medical_insights = analyze_medical_patterns(patient_statements, language)
            
            conversation_context += f"\nBased on this conversation history and medical patterns identified, "
        
        # Build emotion context for the prompt
        emotion_context = ""
        if emotion_analysis:
            primary_emotion = emotion_analysis.get('primary_emotion', 'neutral')
            alert_level = emotion_analysis.get('alert_level', 'NONE')
            vader_description = emotion_analysis.get('vader_details', {}).get('description', '')
            
            emotion_context = f"""
            
EMOTIONAL CONTEXT:
- Patient's emotional state: {primary_emotion}
- Alert level: {alert_level}
- VADER analysis: {vader_description}
- Recommendations: {', '.join(emotion_analysis.get('recommendations', [])[:2])}
            
Consider this emotional context when crafting your response."""

        # Language-specific prompts for multiple questions
        language_prompts = {
            'en-US': {
                'system_role': "You are an AI assistant for a doctor during a medical consultation. While the doctor and patient are speaking over call, the chatbot is expected to understand the transcripted text and suggest multiple relevant questions which are intended to facilitate the conversation.",
                'instruction': "Based on the following medical history of the patient, generate 3 distinct, short, and clinically appropriate follow-up questions for Doctor to ask. Each question should explore different aspects of the patient's condition (symptoms, timeline, severity, triggers, etc.).",
                'patient_label': "Patient:",
                'generate_instruction': "Generate 3 brief, relevant follow-up questions that a doctor might ask (numbered 1., 2., 3.):"
            },
            # 'hi-IN': {
            #     'system_role': "आप एक चिकित्सा परामर्श के दौरान डॉक्टर के लिए एक AI सहायक हैं। जब डॉक्टर और मरीज़ कॉल पर बात कर रहे हैं, तो चैटबॉट को ट्रांसक्रिप्ट को समझना चाहिए और कई प्रासंगिक प्रश्न सुझाने चाहिए।",
            #     'instruction': "मरीज़ के चिकित्सा इतिहास के आधार पर, डॉक्टर के लिए 3 अलग-अलग, संक्षिप्त और चिकित्सकीय रूप से उपयुक्त अनुवर्ती प्रश्न तैयार करें। प्रत्येक प्रश्न मरीज़ की स्थिति के विभिन्न पहलुओं का पता लगाना चाहिए।",
            #     'patient_label': "मरीज़:",
            #     'generate_instruction': "3 संक्षिप्त, प्रासंगिक अनुवर्ती प्रश्न तैयार करें जो एक डॉक्टर पूछ सकता है (संख्या 1., 2., 3.):"
            # }
        }
        
        # Get language-specific prompt or default to English
        lang_prompt = language_prompts.get(language, language_prompts['en-US'])
        
        prompt = f"""
        {lang_prompt['system_role']}
        {lang_prompt['instruction']}
        {conversation_context}
        {medical_insights}

        {lang_prompt['patient_label']} "{transcribed_text}"
        {emotion_context}
        
        {lang_prompt['generate_instruction']}
        
        Format: Each question on a new line with numbers (1., 2., 3.)"""

        # Use gemini-1.5-flash for better rate limits
        model = genai.GenerativeModel("gemini-1.5-flash")
        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                max_output_tokens=100,  # Increased for multiple questions
                temperature=0.7,
                top_p=0.95,
                top_k=40,
                stop_sequences=[lang_prompt['patient_label'], "Doctor:", "डॉक्टर:", "4.", "५."]
            )
        )
        print("Response: ", response.text.strip())

        return response.text.strip()
    
    except Exception as e:
        print(f"❌ Error generating follow-up question: {e}")
        return get_fallback_question(transcribed_text, language)


def detect_emotion_sentiment(transcribed_text):
    """Enhanced emotion and sentiment detection using VADER"""
    
    # Initialize VADER analyzer
    vader_analyzer = SentimentIntensityAnalyzer()
    
    # Get VADER sentiment scores
    vader_scores = vader_analyzer.polarity_scores(transcribed_text)
    
    text_lower = transcribed_text.lower()
    
    # Initialize emotion scores
    emotions = {
        'confusion': 0,
        'distress': 0,
        'anxiety': 0,
        'fear': 0,
        'frustration': 0,
        'sadness': 0,
        'anger': 0,
        'calm': 0,
        'neutral': 0
    }
    
    # Enhanced emotion detection with VADER context
    # Confusion indicators - reduced list to avoid false positives
    confusion_words = ['confused', 'don\'t understand', 'not sure', 'unclear', 'what do you mean', 
                      'i don\'t know', 'not clear', 'confused about', 'don\'t get it',
                      'can you repeat', 'i\'m lost']
    
    # Distress indicators - enhanced with medical urgency
    distress_words = ['help', 'scared', 'worried', 'anxious', 'panic', 'emergency', 'urgent',
                     'can\'t breathe', 'chest pain', 'dizzy', 'faint', 'terrible', 'awful',
                     'getting worse', 'unbearable', 'can\'t take it', 'desperate', 'severe',
                     'excruciating', 'overwhelming']
    
    # Anxiety indicators
    anxiety_words = ['nervous', 'worried', 'anxious', 'stressed', 'tense', 'uneasy',
                    'concerned', 'restless', 'jittery', 'on edge', 'overwhelmed', 'panicked']
    
    # Fear indicators
    fear_words = ['afraid', 'scared', 'frightened', 'terrified', 'fearful', 'alarmed',
                 'what if', 'worried about', 'fear', 'scary', 'dangerous', 'terrifying']
    
    # Frustration indicators
    frustration_words = ['frustrated', 'annoying', 'irritating', 'fed up', 'sick of',
                        'why won\'t', 'nothing works', 'tried everything', 'give up']
    
    # Sadness indicators
    sadness_words = ['sad', 'depressed', 'down', 'low', 'hopeless', 'crying', 'tears',
                    'upset', 'miserable', 'blue', 'lonely', 'empty', 'devastated']
    
    # Anger indicators
    anger_words = ['angry', 'mad', 'furious', 'rage', 'hate', 'disgusting', 'stupid',
                  'ridiculous', 'outrageous', 'unacceptable', 'infuriating']
    
    # Calm indicators
    calm_words = ['fine', 'okay', 'good', 'better', 'calm', 'relaxed', 'peaceful',
                 'comfortable', 'stable', 'manageable', 'relieved']
    
    # Count emotion indicators with VADER weighting
    for word in confusion_words:
        if word in text_lower:
            emotions['confusion'] += 1
    
    for word in distress_words:
        if word in text_lower:
            # Weight distress more heavily if VADER indicates high negativity
            weight = 2 if vader_scores['neg'] > 0.5 else 1
            emotions['distress'] += weight
    
    for word in anxiety_words:
        if word in text_lower:
            weight = 2 if vader_scores['neg'] > 0.3 else 1
            emotions['anxiety'] += weight
    
    for word in fear_words:
        if word in text_lower:
            weight = 2 if vader_scores['neg'] > 0.4 else 1
            emotions['fear'] += weight
    
    for word in frustration_words:
        if word in text_lower:
            emotions['frustration'] += 1
    
    for word in sadness_words:
        if word in text_lower:
            weight = 2 if vader_scores['neg'] > 0.6 else 1
            emotions['sadness'] += weight
    
    for word in anger_words:
        if word in text_lower:
            weight = 2 if vader_scores['neg'] > 0.7 else 1
            emotions['anger'] += weight
    
    for word in calm_words:
        if word in text_lower:
            weight = 2 if vader_scores['pos'] > 0.3 else 1
            emotions['calm'] += weight
    
    # Enhanced pattern detection
    # Question patterns (confusion indicators) - reduced sensitivity
    question_patterns = ['what', 'how', 'why', 'when', 'where', 'which']
    question_count = sum(1 for pattern in question_patterns if pattern in text_lower)
    if question_count > 3:  # Increased threshold from 2 to 3
        emotions['confusion'] += 1
    
    # Repetitive phrases (confusion/frustration)
    words = text_lower.split()
    if len(words) > 3:
        repeated_words = [word for word in set(words) if words.count(word) > 2]
        if repeated_words:
            emotions['confusion'] += 1
    
    # VADER-enhanced emotion adjustment
    # If VADER indicates strong negative sentiment, boost negative emotions
    if vader_scores['compound'] <= -0.5:  # Strong negative
        if emotions['distress'] == 0 and emotions['anxiety'] == 0:
            emotions['distress'] += 1  # Add baseline distress for strong negativity
    
    # If VADER indicates strong positive sentiment, boost calm
    if vader_scores['compound'] >= 0.5:  # Strong positive
        emotions['calm'] += 1
    
    # Determine primary emotion
    primary_emotion = max(emotions, key=emotions.get)
    emotion_score = emotions[primary_emotion]
    
    # Use VADER sentiment with emotion context
    vader_sentiment = get_vader_sentiment_category(vader_scores)
    
    return {
        'primary_emotion': primary_emotion,
        'emotion_score': emotion_score,
        'sentiment': vader_sentiment['category'],
        'sentiment_score': vader_sentiment['intensity'],
        'emotions': emotions,
        'alert_level': get_alert_level(emotions),
        'recommendations': get_emotion_recommendations(primary_emotion, emotions),
        'vader_scores': vader_scores,
        'vader_details': vader_sentiment
    }

def get_vader_sentiment_category(vader_scores):
    """Convert VADER scores to meaningful categories for medical context"""
    compound = vader_scores['compound']
    
    if compound >= 0.05:
        if compound >= 0.5:
            return {'category': 'positive', 'intensity': compound, 'description': 'Patient appears optimistic/confident'}
        else:
            return {'category': 'slightly_positive', 'intensity': compound, 'description': 'Patient seems relatively calm'}
    elif compound <= -0.05:
        if compound <= -0.5:
            return {'category': 'negative', 'intensity': abs(compound), 'description': 'Patient shows significant distress/concern'}
        else:
            return {'category': 'slightly_negative', 'intensity': abs(compound), 'description': 'Patient expresses mild concern'}
    else:
        return {'category': 'neutral', 'intensity': 0.0, 'description': 'Patient maintains neutral emotional tone'}

def get_alert_level(emotions):
    """Determine alert level based on emotion intensities"""
    # Count critical emotional indicators
    distress_indicators = emotions['distress'] + emotions['fear'] + emotions['anxiety']
    confusion_indicators = emotions['confusion']
    anger_indicators = emotions['anger'] + emotions['frustration']
    sadness_indicators = emotions['sadness']
    
    # HIGH ALERT: Multiple distress indicators or severe single indicators
    if distress_indicators >= 3 or emotions['distress'] >= 2:
        return 'HIGH'
    
    # MEDIUM ALERT: Some distress + confusion or moderate emotional distress
    elif (distress_indicators >= 2 and confusion_indicators >= 1) or \
         confusion_indicators >= 3 or \
         anger_indicators >= 2 or \
         sadness_indicators >= 2:
        return 'MEDIUM'
    
    # LOW ALERT: Single indicators or mild emotional states
    elif distress_indicators >= 1 or confusion_indicators >= 1 or \
         anger_indicators >= 1 or sadness_indicators >= 1:
        return 'LOW'
    
    # NO ALERT: Calm or neutral state
    else:
        return 'NONE'

def get_emotion_recommendations(primary_emotion, emotions):
    """Get recommendations based on detected emotions"""
    recommendations = []
    
    if emotions['distress'] > 0:
        recommendations.append("🚨 Patient showing signs of distress - check vital signs and immediate concerns")
        
    if emotions['confusion'] > 2:
        recommendations.append("🤔 Patient appears confused - simplify explanations and check understanding")
        
    if emotions['anxiety'] > 1:
        recommendations.append("😰 Patient showing anxiety - provide reassurance and clear information")
        
    if emotions['fear'] > 1:
        recommendations.append("😨 Patient expressing fear - address concerns with empathy and clear explanations")
        
    if emotions['frustration'] > 1:
        recommendations.append("😤 Patient appears frustrated - acknowledge feelings and provide clearer guidance")
        
    if emotions['sadness'] > 1:
        recommendations.append("😢 Patient showing sadness - offer emotional support and check mental wellbeing")
        
    if emotions['anger'] > 1:
        recommendations.append("😠 Patient expressing anger - remain calm, listen actively, and address concerns")
        
    if emotions['calm'] > 0:
        recommendations.append("😌 Patient appears calm - good opportunity for detailed discussions")
    
    if not recommendations:
        recommendations.append("✅ Patient emotional state appears stable")
    
    return recommendations

def get_fallback_questions(text="", language='en-US', question_count=3):
    """Provide multiple fallback medical questions when AI generation fails"""
    
    fallback_questions = {
        'en-US': [
            # General health questions
            "Can you tell me more about how you're feeling right now?",
            "When did you first notice these symptoms?",
            "How would you rate your pain or discomfort on a scale of 1 to 10?",
            "Have you experienced anything like this before?",
            "Are you taking any medications currently?",
            "Is there anything that makes your symptoms better or worse?",
            "How long have you been experiencing these symptoms?",
            "Can you describe the symptoms in more detail?",
            "Have you noticed any other changes in how you feel?",
            "Is there anything else you'd like me to know about your condition?",
            # Specific symptom follow-ups
            "What triggers or worsens your symptoms?",
            "Do you have any family history of similar conditions?",
            "How are these symptoms affecting your daily activities?",
            "Have you tried any treatments or remedies so far?",
            "Are there any specific times when symptoms are worse?",
            "What concerns you most about these symptoms?",
            "Have you had any recent changes in lifestyle or stress?",
            "Are you experiencing any sleep difficulties?",
            "How is your appetite and energy level?",
            "Do you have any allergies or medical conditions I should know about?"
        ],
        'hi-IN': [
            # सामान्य स्वास्थ्य प्रश्न
            "क्या आप मुझे बता सकते हैं कि आप अभी कैसा महसूस कर रहे हैं?",
            "आपने यह लक्षण पहली बार कब देखे थे?",
            "आप अपने दर्द या परेशानी को 1 से 10 के पैमाने पर कैसे रेट करेंगे?",
            "क्या आपने पहले भी कुछ इस तरह का अनुभव किया है?",
            "क्या आप वर्तमान में कोई दवाइयाँ ले रहे हैं?",
            "क्या कोई ऐसी चीज़ है जो आपके लक्षणों को बेहतर या बदतर बनाती है?",
            "आप कितने समय से इन लक्षणों का अनुभव कर रहे हैं?",
            "क्या आप लक्षणों का और विस्तार से वर्णन कर सकते हैं?",
            "क्या आपने अपने स्वास्थ्य में कोई और बदलाव देखा है?",
            "क्या आपकी स्थिति के बारे में कुछ और है जो आप मुझे बताना चाहेंगे?",
            # विशिष्ट लक्षण फॉलो-अप
            "कौन सी चीज़ें आपके लक्षणों को बढ़ाती या कम करती हैं?",
            "क्या आपके परिवार में इस तरह की कोई बीमारी का इतिहास है?",
            "ये लक्षण आपकी दैनिक गतिविधियों को कैसे प्रभावित कर रहे हैं?",
            "क्या आपने अब तक कोई इलाज या उपाय किया है?",
            "क्या कोई खास समय है जब लक्षण और बदतर हो जाते हैं?",
            "इन लक्षणों के बारे में आपको सबसे ज्यादा क्या चिंता है?",
            "क्या हाल ही में आपकी जीवनशैली या तनाव में कोई बदलाव आया है?",
            "क्या आपको नींद की कोई समस्या हो रही है?",
            "आपकी भूख और ऊर्जा का स्तर कैसा है?",
            "क्या आपको कोई एलर्जी या चिकित्सा स्थिति है जिसके बारे में मुझे जानना चाहिए?"
        ]
    }
    
    # Get questions for the specified language, default to English
    questions = fallback_questions.get(language, fallback_questions['en-US'])
    
    # Select questions based on text content if available
    selected_questions = []
    text_lower = text.lower() if text else ""
    
    # Smart question selection based on content
    if any(word in text_lower for word in ['pain', 'hurt', 'ache', 'दर्द']):
        pain_questions = [q for q in questions if any(word in q.lower() for word in ['pain', 'rate', 'scale', 'दर्द', 'पैमाने'])]
        selected_questions.extend(pain_questions[:question_count])
    elif any(word in text_lower for word in ['fever', 'temperature', 'बुखार']):
        fever_questions = [q for q in questions if any(word in q.lower() for word in ['symptoms', 'when', 'long', 'लक्षण', 'कब'])]
        selected_questions.extend(fever_questions[:question_count])
    elif any(word in text_lower for word in ['stress', 'anxiety', 'worried', 'तनाव', 'चिंता']):
        mental_questions = [q for q in questions if any(word in q.lower() for word in ['feel', 'stress', 'lifestyle', 'महसूस', 'तनाव'])]
        selected_questions.extend(mental_questions[:question_count])
    
    # Fill remaining slots with general questions
    while len(selected_questions) < question_count and len(selected_questions) < len(questions):
        for q in questions[:question_count * 2]:  # Check more questions to avoid repeats
            if q not in selected_questions:
                selected_questions.append(q)
                if len(selected_questions) >= question_count:
                    break
    
    # Format as numbered list
    if question_count > 1:
        numbered_questions = []
        for i, question in enumerate(selected_questions[:question_count], 1):
            numbered_questions.append(f"{i}. {question}")
        return "\n".join(numbered_questions)
    else:
        return selected_questions[0] if selected_questions else questions[0]

def get_fallback_question(text="", language='en-US'):
    """Backward compatibility function for single question"""
    return get_fallback_questions(text, language, 1)

def generate_conversation_summary(conversation_history, emotion_timeline, language='en-US', summary_type='brief'):
    """Generate a summary of the conversation between doctor and patient"""
    try:
        api_key = get_api_key()
        genai.configure(api_key=api_key)
        
        if not conversation_history or len(conversation_history) == 0:
            return "No conversation to summarize."
        
        # Build conversation text
        conversation_text = ""
        for entry in conversation_history:
            speaker = "Patient" if entry['speaker'] == 'patient' else "Doctor"
            if language == 'hi-IN':
                speaker = "मरीज़" if entry['speaker'] == 'patient' else "डॉक्टर"
            conversation_text += f"{speaker}: {entry['text']}\n"
        
        # Build emotion summary
        emotion_summary = ""
        if emotion_timeline:
            emotions = [e['emotion'] for e in emotion_timeline]
            alerts = [e for e in emotion_timeline if e['alert_level'] != 'NONE']
            emotion_summary = f"\nEmotion Timeline: {', '.join(emotions[-5:])}"
            if alerts:
                emotion_summary += f"\nAlert Count: {len(alerts)} emotional alerts detected"
        
        # Language-specific prompts
        if language == 'hi-IN':
            if summary_type == 'comprehensive':
                prompt = f"""
                आप एक चिकित्सा सहायक हैं। निम्नलिखित डॉक्टर-मरीज़ की बातचीत का विस्तृत सारांश प्रदान करें:

                बातचीत:
                {conversation_text}
                {emotion_summary}

                कृपया निम्नलिखित शामिल करें:
                1. मुख्य लक्षण और शिकायतें
                2. मरीज़ की भावनात्मक स्थिति
                3. महत्वपूर्ण चिकित्सा जानकारी
                4. सुझावित अगले कदम
                5. डॉक्टर के लिए सिफारिशें

                संक्षिप्त और स्पष्ट हिंदी में लिखें:
                """
            else:
                prompt = f"""
                निम्नलिखित डॉक्टर-मरीज़ की बातचीत का संक्षिप्त सारांश दें:

                {conversation_text}
                {emotion_summary}

                मुख्य बिंदु और लक्षण हिंदी में बताएं:
                """
        else:
            if summary_type == 'comprehensive':
                prompt = f"""
                You are a medical assistant. Provide a comprehensive summary of this doctor-patient conversation:

                Conversation:
                {conversation_text}
                {emotion_summary}

                Please include:
                1. Chief complaints and symptoms
                2. Patient's emotional state
                3. Key medical information mentioned
                4. Suggested next steps
                5. Recommendations for the doctor

                Write a clear, professional medical summary:
                """
            else:
                prompt = f"""
                Summarize this doctor-patient conversation briefly:

                {conversation_text}
                {emotion_summary}

                Provide key points and symptoms mentioned:
                """

        model = genai.GenerativeModel("gemini-1.5-flash")
        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                max_output_tokens=300 if summary_type == 'comprehensive' else 150,
                temperature=0.3,
                top_p=0.9
            )
        )

        return response.text.strip()
    
    except Exception as e:
        print(f"❌ Error generating conversation summary: {e}")
        if language == 'hi-IN':
            return "बातचीत का सारांश तैयार करने में त्रुटि हुई।"
        else:
            return "Error generating conversation summary."

def extract_conversation_insights(conversation_history, emotion_timeline, language='en-US'):
    """Extract key insights from the conversation for medical analysis"""
    try:
        api_key = get_api_key()
        genai.configure(api_key=api_key)
        
        if not conversation_history:
            return {"symptoms": [], "concerns": [], "emotional_patterns": [], "recommendations": []}
        
        # Build conversation text
        conversation_text = ""
        for entry in conversation_history:
            if entry['speaker'] == 'patient':  # Focus on patient statements
                conversation_text += f"Patient: {entry['text']}\n"
        
        # Analyze emotional patterns
        emotional_patterns = []
        if emotion_timeline:
            emotions = [e['emotion'] for e in emotion_timeline]
            emotion_counts = {}
            for emotion in emotions:
                emotion_counts[emotion] = emotion_counts.get(emotion, 0) + 1
            
            # Most frequent emotions
            sorted_emotions = sorted(emotion_counts.items(), key=lambda x: x[1], reverse=True)
            emotional_patterns = [f"{emotion}: {count} times" for emotion, count in sorted_emotions[:3]]
        
        # Language-specific prompts for insights
        if language == 'hi-IN':
            prompt = f"""
            निम्नलिखित मरीज़ के बयानों का विश्लेषण करें और मुख्य चिकित्सा जानकारी निकालें:

            मरीज़ के बयान:
            {conversation_text}

            भावनात्मक पैटर्न: {', '.join(emotional_patterns)}

            कृपया निम्नलिखित प्रारूप में जवाब दें:
            लक्षण: (मुख्य शारीरिक लक्षण)
            चिंताएं: (मरीज़ की मुख्य चिंताएं)
            सिफारिशें: (डॉक्टर के लिए सुझाव)
            """
        else:
            prompt = f"""
            Analyze the following patient statements and extract key medical information:

            Patient Statements:
            {conversation_text}

            Emotional Patterns: {', '.join(emotional_patterns)}

            Please respond in the following format:
            Symptoms: (main physical symptoms mentioned)
            Concerns: (patient's main concerns or worries)
            Recommendations: (suggestions for the doctor)
            """

        model = genai.GenerativeModel("gemini-1.5-flash")
        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                max_output_tokens=200,
                temperature=0.2,
                top_p=0.9
            )
        )

        # Parse the response into structured data
        response_text = response.text.strip()
        insights = {
            "symptoms": [],
            "concerns": [],
            "emotional_patterns": emotional_patterns,
            "recommendations": [],
            "raw_analysis": response_text
        }

        # Simple parsing of the structured response
        lines = response_text.split('\n')
        current_section = None
        
        for line in lines:
            line = line.strip()
            if line.lower().startswith(('symptoms:', 'लक्षण:')):
                current_section = 'symptoms'
                content = line.split(':', 1)[1].strip() if ':' in line else ''
                if content:
                    insights['symptoms'].append(content)
            elif line.lower().startswith(('concerns:', 'चिंताएं:')):
                current_section = 'concerns'
                content = line.split(':', 1)[1].strip() if ':' in line else ''
                if content:
                    insights['concerns'].append(content)
            elif line.lower().startswith(('recommendations:', 'सिफारिशें:')):
                current_section = 'recommendations'
                content = line.split(':', 1)[1].strip() if ':' in line else ''
                if content:
                    insights['recommendations'].append(content)
            elif line and current_section:
                insights[current_section].append(line)

        return insights
    
    except Exception as e:
        print(f"❌ Error extracting conversation insights: {e}")
        return {
            "symptoms": [],
            "concerns": [],
            "emotional_patterns": [],
            "recommendations": [],
            "error": str(e)
        }

def analyze_medical_patterns(patient_statements, language='en-US'):
    """Analyze patterns in patient statements to identify medical themes"""
    try:
        if not patient_statements:
            return ""
        
        # Combine all patient statements
        combined_text = " ".join(patient_statements).lower()
        
        # Medical pattern categories
        medical_patterns = {
            'pain_symptoms': ['pain', 'hurt', 'ache', 'sore', 'burning', 'stabbing', 'throbbing', 'sharp', 'dull'],
            'respiratory': ['cough', 'breathing', 'breath', 'chest', 'wheeze', 'shortness', 'difficulty breathing'],
            'gastrointestinal': ['stomach', 'nausea', 'vomit', 'diarrhea', 'constipation', 'bloating', 'appetite'],
            'neurological': ['headache', 'dizzy', 'dizziness', 'confusion', 'memory', 'concentration', 'weakness'],
            'cardiovascular': ['heart', 'palpitations', 'chest pain', 'pressure', 'racing heart', 'irregular'],
            'systemic': ['fever', 'tired', 'fatigue', 'weakness', 'energy', 'sleep', 'weight'],
            'mental_health': ['stress', 'anxiety', 'depression', 'worried', 'panic', 'mood', 'emotional'],
            'timeline': ['days', 'weeks', 'months', 'since', 'started', 'began', 'first time', 'getting worse', 'better']
        }
        
        # Identify present patterns
        identified_patterns = []
        for category, keywords in medical_patterns.items():
            if any(keyword in combined_text for keyword in keywords):
                identified_patterns.append(category)
        
        if not identified_patterns:
            return ""
        
        # Generate medical insights based on language
        if language == 'hi-IN':
            insights = f"\n\nचिकित्सा पैटर्न विश्लेषण: मरीज़ ने निम्नलिखित श्रेणियों में लक्षण बताए हैं: {', '.join(identified_patterns)}। इन पैटर्न के आधार पर विस्तृत प्रश्न पूछें।"
        else:
            insights = f"\n\nMEDICAL PATTERN ANALYSIS: Patient has mentioned symptoms in the following categories: {', '.join(identified_patterns)}. Focus questions on exploring these patterns in detail."
        
        return insights
        
    except Exception as e:
        print(f"❌ Error in medical pattern analysis: {e}")
        return ""




