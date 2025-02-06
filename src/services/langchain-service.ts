import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HuggingFaceInference } from "@langchain/community/llms/hf";

class LangChainService {
  private model: ChatOpenAI | ChatGoogleGenerativeAI | HuggingFaceInference;
  private systemPrompt: string;

  constructor(modelProvider: 'openai' | 'google' | 'huggingface' = 'openai') {
    switch (modelProvider) {
        case 'openai':
            this.model = new ChatOpenAI({
                openAIApiKey: process.env.REACT_APP_OPENAI_API_KEY,
                modelName: 'gpt-4o',
                maxTokens: 500,
            });
            break;
        case 'google':
            this.model = new ChatGoogleGenerativeAI({
                apiKey: process.env.REACT_APP_GOOGLE_API_KEY,
                modelName: 'gemini-1.5-flash',
                maxOutputTokens: 500,
            });
            break;
        case 'huggingface':
            this.model = new HuggingFaceInference({
                apiKey: process.env.REACT_APP_HUGGINGFACE_API_KEY,
                model: 'microsoft/Phi-3-vision-128k-instruct'
            });
            break;
        default:
            throw new Error('Invalid model provider');
    }
    this.systemPrompt = `You are an AI assistant analyzing screenshots to detect user behavior and learning patterns.
Your task is to analyze screenshots and determine if they represent active learning behavior.`;
  }

  async analyzeScreenshot(imagesBase64: string[], currentTime: string) {
    const template = `Analyze these consecutive screenshots of a user's screen activity.
    The screenshots capture the user's screen state over time.

    Respond in this exact JSON format:
    {
        "is_learning_platform": boolean,
        "app_name": string,
        "course_name": string,
        "subject": string,
        "is_active_learning_screen": boolean,
        "explanation": string,
        "current_time": string,
        "user_activity": string,
        "idle_behavior": boolean
    }

    Guidelines:
    - is_learning_platform: true if ANY screenshot shows an educational platform (e.g. Coursera, edX, Khan Academy, IXL, etc.)
    - app_name: name of the learning application/platform being used (e.g. "Coursera", "Khan Academy", "IXL"). Return null if not a learning platform
    - course_name: specific course title if visible (e.g. "Introduction to Python"). Return null if not visible
    - subject: general subject area or topic (e.g. "Mathematics", "Computer Science"). Return null if not clear
    - is_active_learning_screen: true if ANY screenshot shows active learning content like:
        * Video lectures being played
        * Quiz/test questions being answered  
        * Assignments being worked on
        * Interactive exercises
      Return false for passive screens like:
        * Course catalogs/listings
        * Dashboards/home pages
        * Settings pages
        * Login screens
        * Results/grades pages etc.
    - explanation: Brief description of what changed between screenshots and any patterns observed
    - current_time: Return the following time without any changes: ${currentTime}
    - user_activity: Brief description of user's apparent activity based on screen changes
    - idle_behavior: true if screenshots suggest user inactivity (e.g. no changes between screenshots, stuck on non-learning pages)

    Focus on identifying actual learning activities versus administrative/navigation screens.
    Look for evidence of active engagement with educational content.`;

    // const prompt = PromptTemplate.fromTemplate(template);
    // const formattedPrompt = await prompt.format({ currentTime });
    const images = imagesBase64.map(image => ({
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${image}` }
    }));


    try {
      const response = await this.model.invoke([
        new SystemMessage(this.systemPrompt),
        new HumanMessage({
          content: [
            { type: 'text', text: template },
            ...images
          ]
        })
      ]);

      const content = response;
      return content;
    //   console.log(content);

    //   if (typeof content !== 'string') {
    //     throw new Error('Unexpected response format');
    //   }

    //   // Extract JSON content from markdown if present
    //   let jsonContent = content;
    //   if (content.includes('```json')) {
    //     jsonContent = content.split('```json')[1].split('```')[0].trim();
    //   } else if (content.includes('```')) {
    //     jsonContent = content.split('```')[1].split('```')[0].trim();
    //   }

    //   return JSON.parse(jsonContent);
    } catch (error) {
      console.error('Error analyzing screenshot:', error);
      throw error;
    }
  }

//   async compareScreenshots(image1: string, image2: string): Promise<boolean> {
//     const template = `Compare these two screenshots of a user's screen.
    
//     Analyze and respond in this exact JSON format:
//     {
//         "is_screen_idle": boolean,
//         "explanation": string
//     }
    
//     Guidelines:
//     - is_screen_idle: true if both screenshots are of the same screen.
//     If the screenshots even slightly differ, return false.
//     - explanation: brief description of what changed`;

//     try {
//       const response = await this.model.call([
//         new SystemMessage(this.systemPrompt),
//         new HumanMessage({
//           content: [
//             { type: 'text', text: template },
//             {
//               type: 'image_url',
//               image_url: { url: `data:image/jpeg;base64,${image1}` }
//             },
//             {
//               type: 'image_url',
//               image_url: { url: `data:image/jpeg;base64,${image2}` }
//             }
//           ]
//         })
//       ]);

//       const content = response.content;
//       if (typeof content !== 'string') {
//         throw new Error('Unexpected response format');
//       }

//       // Extract JSON content from markdown if present
//       let jsonContent = content;
//       if (content.includes('```json')) {
//         jsonContent = content.split('```json')[1].split('```')[0].trim();
//       } else if (content.includes('```')) {
//         jsonContent = content.split('```')[1].split('```')[0].trim();
//       }

//       const result = JSON.parse(jsonContent);
//       return result.is_screen_idle;
//     } catch (error) {
//       console.error('Error comparing screenshots:', error);
//       return false;
//     }
//   }
}

export const langchainService = new LangChainService('huggingface'); 