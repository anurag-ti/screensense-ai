from flask import Flask, request, jsonify
from flask_cors import CORS
import cv2
import numpy as np
import base64
from openai import OpenAI
import logging
import json

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

@app.route('/compare-screenshots', methods=['POST'])
def compare_screenshots():
    try:
        data = request.json
        base64_image1 = data['image1']
        base64_image2 = data['image2']

        if ',' in base64_image1:
            base64_image1 = base64_image1.split(',')[1]
        if ',' in base64_image2:
            base64_image2 = base64_image2.split(',')[1]


        logger.info("Making OpenAI API request...")
        
        response = client.chat.completions.create(
                model="gpt-4o-mini",  # Updated model
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": """Provided are two screenshots of a user's screen at a particular time.
                                

                                Analyze and respond in this exact JSON format:
                                {
                                    "is_screen_idle": boolean,
                                    "explanation": string,
                                }
                                

                                Guidelines:
                                - is_screen_idle: true if both screenshots are of the same screen.
                                If the screenshots even slightly differ, return false.
                                For example, if the user has scrolled down in the second screenshot, return false. If one of the screenshots displays one extra element or word, return false. Feel free to use OCR to compare the screenshots but do not hallucinate or rely on OCR completely.
                                - explanation: brief description of what changed""",
                            },
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:image/jpeg;base64,{base64_image1}"},
                            },
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:image/jpeg;base64,{base64_image2}"},
                            },
                        ],
                    }
                ],


                max_tokens=500,
            )
        
        # Extract just the JSON content, removing any markdown formatting
        content = response.choices[0].message.content
        if '```json' in content:
            # Extract JSON between triple backticks
            content = content.split('```json')[1].split('```')[0].strip()
        elif '```' in content:
            # Extract JSON between triple backticks (no language specified)
            content = content.split('```')[1].split('```')[0].strip()
            
        # Parse the JSON string to ensure it's valid JSON
        parsed_content = json.loads(content)
        
        logger.info(f"OpenAI API Response (parsed): {parsed_content}")
        return jsonify(parsed_content)
    
    except Exception as e:
        logger.error(f"Error in compare_screenshots: {str(e)}", exc_info=True)
        return jsonify({
            'error': str(e)
        }), 500

@app.route('/analyze-screenshot', methods=['POST'])
def analyze_screenshot():
    try:
        data = request.json
        base64_image = data['image']
        current_time = data['current_time']

        if ',' in base64_image:
            base64_image = base64_image.split(',')[1]

        logger.info("Making OpenAI API request...")
        
        response = client.chat.completions.create(
                model="gpt-4o-mini",  # Updated model
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": """Provided is a screenshot of a user's screen at a particular time along with the current time.
                                
                                Analyze and respond in this exact JSON format:
                                {
                                    "is_learning_platform": boolean,
                                    "app_name": string,
                                    "course_name": string,
                                    "subject": string,
                                    "is_active_learning_screen": boolean,
                                    "explanation": string,
                                    "current_time": string
                                }
                                

                                Guidelines:
                                - is_learning_platform: true if the screenshot is from a learning platform
                                - app_name: name of the application or software or website for learning being used otherwise null
                                - course_name: name of the course if visible otherwise null
                                - subject: subject matter or topic being studied otherwise null
                                - is_active_learning_screen: true if the screenshot is from a learning platform's active session like quiz, assignment, video etc. Non-active screens include dashboard, login, test results page, summary, test selection page , any page of non-learning platform etc.
                                - explanation: brief description of what changed
                                - current_time: Return the provided current time""",



                            },
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"},
                            },
                            {
                                "type": "text",
                                "text": f"Current time: {current_time}"
                            }
                        ],
                    }
                ],

                max_tokens=500,
            )
        
        # Extract just the JSON content, removing any markdown formatting
        content = response.choices[0].message.content
        if '```json' in content:
            # Extract JSON between triple backticks
            content = content.split('```json')[1].split('```')[0].strip()
        elif '```' in content:
            # Extract JSON between triple backticks (no language specified)
            content = content.split('```')[1].split('```')[0].strip()
            
        # Parse the JSON string to ensure it's valid JSON
        parsed_content = json.loads(content)
        
        logger.info(f"OpenAI API Response (parsed): {parsed_content}")
        return jsonify(parsed_content)
    
    except Exception as e:
        logger.error(f"Error in compare_screenshots: {str(e)}", exc_info=True)
        return jsonify({
            'error': str(e)
        }), 500

# @app.route('/analyze-screenshot', methods=['POST'])
# def analyze_screenshot():
#     try:
#         data = request.json
#         base64_image = data['image']

#         if ',' in base64_image:
#             base64_image = base64_image.split(',')[1]
        
#         # Add debug logging
#         logger.info("Making OpenAI API request...")
        
#         response = client.chat.completions.create(
#                 model="gpt-4o-mini",
#                 messages=[
#                     {
#                         "role": "user",
#                         "content": [
#                             {
#                                 "type": "text",
#                                 "text": """Analyze the screenshot and identify: 1) The application or software being used 2) The course name if visible 3) The subject matter or topic being studied. 4) Is active screen of application or not. Return the results in JSON format with keys: app_name, course_name, subject, is_active_screen.  Use null value if you are not able to identify any of the above. Examples of non-active screen inlcude dashboard page, login page, test results page etc. Active screen for an app is something like an assignment page, quiz page, video page for a course etc.
                                
#                                 OUTPUT FORMAT:{"app_name": "string", "course_name": "string", "subject": "string", "is_active_screen": "boolean"}""",
#                             },
#                             {
#                                 "type": "image_url",
#                                 "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"},
#                             },
#                         ],
#                     }
#                 ],
#             )
#         logger.info(f"OpenAI API Response: {response.choices[0].message.content}")
#         return jsonify({
#             'analysis': response.choices[0].message.content
#         })
    
#     except Exception as e:
#         logger.error(f"Error in analyze_screenshot: {str(e)}", exc_info=True)  # Added detailed error logging
#         return jsonify({
#             'error': str(e)
#         }), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000) 