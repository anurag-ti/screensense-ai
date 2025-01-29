from flask import Flask, request, jsonify
from flask_cors import CORS
import cv2
import numpy as np
import base64
from openai import OpenAI
import logging

client = OpenAI()

app = Flask(__name__)
CORS(app)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def base64_to_cv2(base64_string):
    # Remove data URL prefix if present
    if ',' in base64_string:
        base64_string = base64_string.split(',')[1]
    
    # Decode base64 string to image
    img_data = base64.b64decode(base64_string)
    np_arr = np.frombuffer(img_data, np.uint8)
    return cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

@app.route('/detect-face', methods=['POST'])
def detect_face():
    try:
        # Get image from request
        data = request.json
        image = base64_to_cv2(data['image'])
        
        # Load face cascade classifier
        face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        
        # Convert to grayscale
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # Detect faces
        faces = face_cascade.detectMultiScale(gray, 1.1, 4)
        
        # Return result
        return jsonify({
            'faceDetected': len(faces) > 0
        })
    
    except Exception as e:
        return jsonify({
            'error': str(e)
        }), 500

@app.route('/analyze-screenshot', methods=['POST'])
def analyze_screenshot():
    try:
        data = request.json
        base64_image = data['image']

        if ',' in base64_image:
            base64_image = base64_image.split(',')[1]
        
        # Add debug logging
        logger.info("Making OpenAI API request...")
        
        response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": "Analyze this screenshot and identify: 1) The application or software being used probably using the URL 2) The course name if visible 3) The subject matter or topic being studied. Return the results in JSON format with keys: app_name, course_name, subject",
                            },
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"},
                            },
                        ],
                    }
                ],
            )
        logger.info(f"OpenAI API Response: {response.choices[0].message.content}")
        return jsonify({
            'analysis': response.choices[0].message.content
        })
    
    except Exception as e:
        logger.error(f"Error in analyze_screenshot: {str(e)}", exc_info=True)  # Added detailed error logging
        return jsonify({
            'error': str(e)
        }), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000) 