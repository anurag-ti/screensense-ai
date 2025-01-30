/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import cn from 'classnames';

import {
  memo,
  ReactNode,
  RefObject,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from 'react';
import { useLiveAPIContext, useSecondaryLiveAPIContext } from '../../contexts/LiveAPIContext';
import { UseMediaStreamResult } from '../../hooks/use-media-stream-mux';
import { useScreenCapture } from '../../hooks/use-screen-capture';
import { useWebcam } from '../../hooks/use-webcam';
import { AudioRecorder } from '../../lib/audio-recorder';
import AudioPulse from '../audio-pulse/AudioPulse';
import './control-tray.scss';
import { assistantConfigs } from '../../configs/assistant-configs';
import { trackEvent } from '../../shared/analytics';
import Toast from '../toast/Toast';
const { ipcRenderer } = window.require('electron');

export type ControlTrayProps = {
  videoRef: RefObject<HTMLVideoElement>;
  secondaryVideoRef: RefObject<HTMLVideoElement>;
  children?: ReactNode;
  supportsVideo: boolean;
  onVideoStreamChange?: (stream: MediaStream | null) => void;
  onSecondaryVideoStreamChange?: (stream: MediaStream | null) => void;
  modes: { value: string }[];
  selectedOption: { value: string };
  setSelectedOption: (option: { value: string }) => void;
};

type MediaStreamButtonProps = {
  isStreaming: boolean;
  onIcon: string;
  offIcon: string;
  start: () => Promise<any>;
  stop: () => any;
};

/**
 * button used for triggering webcam or screen-capture
 */
const MediaStreamButton = memo(
  ({ isStreaming, onIcon, offIcon, start, stop }: MediaStreamButtonProps) =>
    isStreaming ? (
      <button className="action-button" onClick={stop}>
        <span className="material-symbols-outlined">{onIcon}</span>
      </button>
    ) : (
      <button className="action-button" onClick={start}>
        <span className="material-symbols-outlined">{offIcon}</span>
      </button>
    )
);

function ControlTray({
  videoRef,
  secondaryVideoRef,
  children,
  onVideoStreamChange = () => { },
  onSecondaryVideoStreamChange = () => { },
  supportsVideo,
  modes,
  selectedOption,
  setSelectedOption,
}: ControlTrayProps) {
  const webcamStream = useWebcam();
  const screenCaptureStream = useScreenCapture();
  const [inVolume, setInVolume] = useState(0);
  const [audioRecorder] = useState(() => new AudioRecorder());
  const [muted, setMuted] = useState(false);
  const connectButtonRef = useRef<HTMLButtonElement>(null);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const primaryContext = useLiveAPIContext();
  const secondaryContext = useSecondaryLiveAPIContext();
  
  const { client: primaryClient, connected: primaryConnected, connect: connectPrimary, disconnect: disconnectPrimary } = primaryContext;
  const { client: secondaryClient, connected: secondaryConnected, connect: connectSecondary, disconnect: disconnectSecondary } = secondaryContext;

  // Consider both connections for overall connected state
  const connected = primaryConnected && secondaryConnected;

  useEffect(() => {
    if (!connected && connectButtonRef.current) {
      connectButtonRef.current.focus();
    }
  }, [connected]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--volume',
      `${Math.max(5, Math.min(inVolume * 200, 8))}px`
    );
  }, [inVolume]);

  useEffect(() => {
    const onData = (base64: string) => {
      // Send audio to both clients
      primaryClient.sendRealtimeInput([
        {
          mimeType: 'audio/pcm;rate=16000',
          data: base64,
        },
      ]);
      secondaryClient.sendRealtimeInput([
        {
          mimeType: 'audio/pcm;rate=16000',
          data: base64,
        },
      ]);
    };
    if (connected && !muted && audioRecorder) {
      audioRecorder.on('data', onData).on('volume', setInVolume).start();
    } else {
      audioRecorder.stop();
    }
    return () => {
      audioRecorder.off('data', onData).off('volume', setInVolume);
    };
  }, [connected, primaryClient, secondaryClient, muted, audioRecorder]);

  // Handle screen capture stream
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = screenCaptureStream.stream;
    }
    onVideoStreamChange(screenCaptureStream.stream);
  }, [screenCaptureStream.stream, onVideoStreamChange, videoRef]);

  // Handle webcam stream
  useEffect(() => {
    if (secondaryVideoRef.current) {
      secondaryVideoRef.current.srcObject = webcamStream.stream;
    }
    onSecondaryVideoStreamChange(webcamStream.stream);
  }, [webcamStream.stream, onSecondaryVideoStreamChange, secondaryVideoRef]);

  // Stop all streams when connection is closed
  useEffect(() => {
    if (!connected) {
      screenCaptureStream.stop();
      webcamStream.stop();
      onVideoStreamChange(null);
      onSecondaryVideoStreamChange(null);
      ipcRenderer.send('remove_subtitles');
    }
  }, [connected, screenCaptureStream, webcamStream, onVideoStreamChange, onSecondaryVideoStreamChange]);

  useEffect(() => {
    setSelectedOption(modes[carouselIndex]);
    // Send carousel update to control window
    const mode = modes[carouselIndex].value as keyof typeof assistantConfigs;
    const modeName = assistantConfigs[mode].display_name;
    const requiresDisplay = assistantConfigs[mode].requiresDisplay;
    ipcRenderer.send('update-carousel', { modeName, requiresDisplay });
  }, [carouselIndex, modes, setSelectedOption]);

  // Send initial mode's requiresDisplay setting
  useEffect(() => {
    const initialMode = modes[0].value as keyof typeof assistantConfigs;
    const modeName = assistantConfigs[initialMode].display_name;
    const requiresDisplay = assistantConfigs[initialMode].requiresDisplay;
    ipcRenderer.send('update-carousel', { modeName, requiresDisplay });
  }, [modes]);

  const handleCarouselChange = useCallback(
    (direction: 'next' | 'prev') => {
      setCarouselIndex(prevIndex => {
        const newIndex =
          direction === 'next'
            ? (prevIndex + 1) % modes.length
            : (prevIndex - 1 + modes.length) % modes.length;
        return newIndex;
      });
    },
    [modes.length]
  );

  // Add an effect to send the initial message when connection is established
  useEffect(() => {
    if (connected) {
      // Send initial system message about screen sharing state
      if (selectedOption.value === 'screen_capture_record') {
        primaryClient.send([{ text: "Say 'Welcome to Screen Sense AI' and then ask the following question to the user: 'Do you want to start recording action?' If he says yes, then invoke the start_recording function. Give user a confirmation message that you have started recording action or not." }]);
        secondaryClient.send([{ text: "You are the webcam assistant. Your role is to observe webcam feed" }]);
      }
      else if (selectedOption.value === 'screen_capture_play') {
        primaryClient.send([{ text: "Say 'Welcome to Screen Sense AI' and then ask the following question to the user: 'Do you want to play recorded action?' If he says yes, invoke the run_action function. If he says no, do nothing. Give user a confirmation message that you have started playing recorded action or not." }]);
        secondaryClient.send([{ text: "You are the webcam assistant. Your role is to analyze facial expressions and gestures from the webcam feed." }]);
      }
      else {
        primaryClient.send([{ text: "Screen sharing has been disabled. Any screen content you might see is from an older session and should be completely ignored. Do not use any screen data for your responses. If you have understood, reply with 'Welcome to Screen Sense AI'" }]);
        secondaryClient.send([{ text: "You are the webcam assistant. Your role is to analyze facial expressions and gestures from the webcam feed." }]);
      }
    }
  }, [connected, primaryClient, secondaryClient, selectedOption.value]);

  const handleConnect = () => {
    if (!connected) {
      trackEvent('chat_started', {
        assistant_mode: selectedOption.value,
      });
      // Connect both clients
      connectPrimary();
      connectSecondary();
    } else {
      // Disconnect both clients
      disconnectPrimary();
      disconnectSecondary();
    }
  };

  // Handle carousel actions from control window
  useEffect(() => {
    const handleCarouselAction = (event: any, direction: 'next' | 'prev') => {
      handleCarouselChange(direction);
    };

    ipcRenderer.on('carousel-action', handleCarouselAction);
    return () => {
      ipcRenderer.removeListener('carousel-action', handleCarouselAction);
    };
  }, [handleCarouselChange]);

  // Handle control actions from video window
  useEffect(() => {
    const handleControlAction = (event: any, action: { type: string; value: boolean }) => {
      switch (action.type) {
        case 'mic':
          setMuted(!action.value);
          break;
        case 'screen':
          if (action.value) {
            // Start screen sharing
            screenCaptureStream.start().then(() => {
              // Send message to Gemini that screen sharing is enabled
              primaryClient.send([{ text: "Screen sharing has been enabled. You can now use screen data for evaluation. If you have understood, reply with 'Screen sharing enabled'" }]);
              secondaryClient.send([{ text: "Screen sharing has been enabled. You can now use screen data for evaluation. If you have understood, reply with 'Screen sharing enabled'" }]);
            });
          } else {
            // Stop screen sharing and notify Gemini
            screenCaptureStream.stop();
            primaryClient.send([{ text: "Screen sharing has been disabled. Any screen content you might see is from an older session and should be completely ignored. Do not use any screen data for your responses. If you have understood, reply with 'Screen sharing disabled'" }]);
            secondaryClient.send([{ text: "Screen sharing has been disabled. Any screen content you might see is from an older session and should be completely ignored. Do not use any screen data for your responses. If you have understood, reply with 'Screen sharing disabled'" }]);
          }
          break;
        case 'webcam':
          if (action.value) {
            webcamStream.start();
          } else {
            webcamStream.stop();
          }
          break;
        case 'connect':
          if (action.value) {
            connectPrimary();
            connectSecondary();
          } else {
            disconnectPrimary();
            disconnectSecondary();
          }
          break;
      }
    };

    ipcRenderer.on('control-action', handleControlAction);
    return () => {
      ipcRenderer.removeListener('control-action', handleControlAction);
    };
  }, [screenCaptureStream, webcamStream, primaryClient, secondaryClient, connectPrimary, connectSecondary, disconnectPrimary, disconnectSecondary]);

  // Send state updates to video window
  useEffect(() => {
    ipcRenderer.send('update-control-state', {
      isMuted: muted,
      isScreenSharing: screenCaptureStream.isStreaming,
      isWebcamOn: webcamStream.isStreaming,
      isConnected: connected,
    });

    // Show/hide main window based on active streams
    if (screenCaptureStream.isStreaming || webcamStream.isStreaming) {
      ipcRenderer.send('show-main-window');
    } else {
      ipcRenderer.send('hide-main-window');
    }
  }, [muted, screenCaptureStream.isStreaming, webcamStream.isStreaming, connected]);

  // Add effect to handle stopping streams when switching modes
  useEffect(() => {
    if (!assistantConfigs[selectedOption.value as keyof typeof assistantConfigs].requiresDisplay) {
      if (screenCaptureStream.isStreaming || webcamStream.isStreaming) {
        screenCaptureStream.stop();
        webcamStream.stop();
        ipcRenderer.send('hide-main-window');
      }
    }
  }, [selectedOption.value, screenCaptureStream.isStreaming, webcamStream.isStreaming]);

  useEffect(() => {
    // Listen for error messages from main process
    ipcRenderer.on('show-error-toast', (_, message) => {
      setErrorMessage(message);
    });

    return () => {
      ipcRenderer.removeAllListeners('show-error-toast');
    };
  }, []);

  return (
    <>
      <section className="control-tray">
        <div className="control-tray-container">
          <nav className={cn('actions-nav', { disabled: !connected })}>
            {supportsVideo && (
              <>
                <MediaStreamButton
                  isStreaming={screenCaptureStream.isStreaming}
                  onIcon="stop_screen_share"
                  offIcon="screen_share"
                  start={screenCaptureStream.start}
                  stop={screenCaptureStream.stop}
                />
                <MediaStreamButton
                  isStreaming={webcamStream.isStreaming}
                  onIcon="videocam_off"
                  offIcon="videocam"
                  start={webcamStream.start}
                  stop={webcamStream.stop}
                />
              </>
            )}
            <button
              className={cn('action-button', { active: !muted })}
              onClick={() => setMuted(!muted)}
            >
              <span className="material-symbols-outlined">
                {muted ? 'mic_off' : 'mic'}
              </span>
            </button>
            <button
              ref={connectButtonRef}
              className={cn('action-button', { active: connected })}
              onClick={handleConnect}
            >
              <span className="material-symbols-outlined">
                {connected ? 'close' : 'chat'}
              </span>
            </button>
            {children}
          </nav>

          <div className="carousel-container">
            <button
              className="carousel-button action-button"
              onClick={() => handleCarouselChange('prev')}
            >
              <span className="material-symbols-outlined">chevron_left</span>
            </button>

            <div className="carousel-content">
              <div className="carousel-slide">
                <span className="carousel-text">
                  {
                    assistantConfigs[selectedOption.value as keyof typeof assistantConfigs]
                      .display_name
                  }
                </span>
              </div>
            </div>

            <button
              className="carousel-button action-button"
              onClick={() => handleCarouselChange('next')}
            >
              <span className="material-symbols-outlined">chevron_right</span>
            </button>
          </div>
        </div>

        <div className={cn('connection-container', { connected })}>
          <div className="connection-button-container">
            <button
              ref={connectButtonRef}
              className={cn('action-button connect-toggle', { connected })}
              onClick={handleConnect}
            >
              <span className="material-symbols-outlined filled">
                {connected ? 'pause' : 'play_arrow'}
              </span>
            </button>
          </div>
          <span className="text-indicator">Streaming</span>
        </div>
      </section>
      {errorMessage && (
        <Toast message={errorMessage} type="error" onClose={() => setErrorMessage(null)} />
      )}
    </>
  );
}

export default memo(ControlTray);
