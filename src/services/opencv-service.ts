import cv from '@techstark/opencv-js';

interface TemplateMatchResult {
  location: { x: number; y: number };
  confidence: number;
}

export class OpenCVService {
  private async base64ToMat(base64Image: string): Promise<cv.Mat> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const mat = cv.imread(img);
        resolve(mat);
      };
      img.onerror = reject;
      // Use the base64 string directly if it's a data URL, or convert it to one
      img.src = base64Image.startsWith('data:') ? base64Image : `data:image/png;base64,${base64Image}`;
    });
  }

  private async loadTemplate(templatePath: string): Promise<cv.Mat> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const mat = cv.imread(img);
        resolve(mat);
      };
      img.onerror = reject;
      img.src = templatePath;
    });
  }

  async findTemplate(
    screenImage: string,
    templatePath: string,
    threshold: number = 0.0,
    method: number = cv.TM_CCOEFF_NORMED
  ): Promise<TemplateMatchResult | null> {
    try {
      const screen = await this.base64ToMat(screenImage);
      const template = await this.loadTemplate(templatePath);

      const screenGray = new cv.Mat();
      const templateGray = new cv.Mat();
      cv.cvtColor(screen, screenGray, cv.COLOR_RGBA2GRAY);
      cv.cvtColor(template, templateGray, cv.COLOR_RGBA2GRAY);

      const result = new cv.Mat();
      cv.matchTemplate(screenGray, templateGray, result, method);
      
      const mask = new cv.Mat();
      const minMax = cv.minMaxLoc(result, mask);
      mask.delete();
      const { maxVal, maxLoc } = minMax;

      // Store dimensions before cleanup
      const templateWidth = template.cols;
      const templateHeight = template.rows;

      // Cleanup
      screen.delete();
      template.delete();
      screenGray.delete();
      templateGray.delete();
      result.delete();

      if (maxVal >= threshold) {
        // Calculate midpoint of the matched region
        const centerX = maxLoc.x + Math.floor(templateWidth / 2);
        const centerY = maxLoc.y + Math.floor(templateHeight / 2);
        return {
          location: {
            x: centerX,
            y: centerY
          },
          confidence: maxVal
        };
      }

      return null;
    } catch (error) {
      console.error('Template matching error:', error);
      return null;
    }
  }

  async findAllTemplateMatches(
    screenImage: string,
    templatePath: string,
    threshold: number = 0.8
  ): Promise<TemplateMatchResult[]> {
    try {
      const screen = await this.base64ToMat(screenImage);
      const template = cv.imread(templatePath);

      const screenGray = new cv.Mat();
      const templateGray = new cv.Mat();
      cv.cvtColor(screen, screenGray, cv.COLOR_RGBA2GRAY);
      cv.cvtColor(template, templateGray, cv.COLOR_RGBA2GRAY);

      const result = new cv.Mat();
      cv.matchTemplate(screenGray, templateGray, result, cv.TM_CCOEFF_NORMED);
      
      const matches: TemplateMatchResult[] = [];
      for (let y = 0; y < result.rows; y++) {
        for (let x = 0; x < result.cols; x++) {
          const confidence = result.data32F[y * result.cols + x];
          if (confidence >= threshold) {
            matches.push({
              location: {
                x: x + template.cols / 2,
                y: y + template.rows / 2
              },
              confidence
            });
          }
        }
      }

      // Cleanup
      screen.delete();
      template.delete();
      screenGray.delete();
      templateGray.delete();
      result.delete();

      return matches;
    } catch (error) {
      console.error('Template matching error:', error);
      return [];
    }
  }

  async compareImages(image1Base64: string, image2Base64: string): Promise<{ similarity: number }> {
    try {
      const mat1 = await this.base64ToMat(image1Base64);
      const mat2 = await this.base64ToMat(image2Base64);

      // Convert images to grayscale for better comparison
      const gray1 = new cv.Mat();
      const gray2 = new cv.Mat();
      cv.cvtColor(mat1, gray1, cv.COLOR_RGBA2GRAY);
      cv.cvtColor(mat2, gray2, cv.COLOR_RGBA2GRAY);

      // Ensure both images are the same size
      if (gray1.rows !== gray2.rows || gray1.cols !== gray2.cols) {
        cv.resize(gray2, gray2, new cv.Size(gray1.cols, gray1.rows));
      }

      // Calculate absolute difference between images
      const diff = new cv.Mat();
      cv.absdiff(gray1, gray2, diff);

      // Calculate mean squared error
      const mse = cv.mean(diff)[0];
      
      // Convert MSE to similarity score (0 to 1)
      // MSE of 0 means identical images (similarity = 1)
      // Using exponential decay to convert MSE to similarity
      const similarity = Math.exp(-mse / 255);

      // Cleanup
      mat1.delete();
      mat2.delete();
      gray1.delete();
      gray2.delete();
      diff.delete();

      return { similarity };
    } catch (error) {
      console.error('Error comparing images:', error);
      return { similarity: 0 };
    }
  }
}

export const opencvService = new OpenCVService(); 