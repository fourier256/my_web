import { useCallback, useEffect, useRef, useState } from 'react';
import { useInAppAds } from './hooks/useInAppAds';

const AD_GROUP_ID = 'YOUR_AD_GROUP_ID';

function AdOverlay({
    isAdLoaded,
    onShowAd,
    onSkip,
}: {
    isAdLoaded: boolean;
    onShowAd: () => void;
    onSkip: () => void;
}) {
    return (
        <div style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: '16px', zIndex: 9999, color: '#fff',
            fontFamily: 'Verdana, sans-serif',
        }}>
            <p style={{ fontSize: '18px', marginBottom: '8px' }}>
                게임 시작 전 광고를 시청해 주세요
            </p>
            <button
                onClick={onShowAd}
                disabled={!isAdLoaded}
                style={{
                    padding: '12px 32px', fontSize: '16px',
                    background: isAdLoaded ? '#3380ff' : '#444',
                    color: '#fff', border: 'none', borderRadius: '8px',
                    cursor: isAdLoaded ? 'pointer' : 'not-allowed',
                    minWidth: '160px',
                }}
            >
                {isAdLoaded ? '광고 보기' : '광고 로딩 중...'}
            </button>
            <button
                onClick={onSkip}
                style={{
                    padding: '8px 24px', fontSize: '13px',
                    background: 'transparent', color: '#888',
                    border: '1px solid #555', borderRadius: '8px',
                    cursor: 'pointer',
                }}
            >
                건너뛰기
            </button>
        </div>
    );
}

function App() {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [showAdOverlay, setShowAdOverlay] = useState(false);

    // ✅ 광고를 실제로 실행중인지 추적하는 플래그
    const adInProgressRef = useRef(false);

    const { showAd, isSupported, isAdLoaded } = useInAppAds(AD_GROUP_ID);

    const postToGame = useCallback((data: object) => {
        iframeRef.current?.contentWindow?.postMessage(data, '*');
    }, []);

    // ✅ isSupported 확정되면 게임에 알려줌
    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;
        const handleIframeLoad = () => {
            postToGame({ type: 'AD_SUPPORT_STATUS', isSupported });
        };
        iframe.addEventListener('load', handleIframeLoad);
        return () => iframe.removeEventListener('load', handleIframeLoad);
    }, [isSupported, postToGame]);

    // ✅ 게임으로부터 SHOW_AD 요청 수신
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (!event.data || typeof event.data !== 'object') return;
            if (event.data.type === 'SHOW_AD') {
                if (isSupported) {
                    setShowAdOverlay(true);
                } else {
                    postToGame({ type: 'AD_FAILED' });
                }
            }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [isSupported, postToGame]);

    // ✅ 광고 dismissed 감지
    //    adInProgressRef가 true일 때만 → 진짜 광고가 끝난 것
    const prevIsAdLoaded = useRef(isAdLoaded);
    useEffect(() => {
        if (
            prevIsAdLoaded.current === true &&
            isAdLoaded === false &&
            adInProgressRef.current === true  // ← 광고 실행 중이었을 때만
        ) {
            adInProgressRef.current = false;
            setShowAdOverlay(false);
            postToGame({ type: 'AD_DONE' });
        }
        prevIsAdLoaded.current = isAdLoaded;
    }, [isAdLoaded, postToGame]);

    // 오버레이에서 "광고 보기" 클릭
    const handleShowAd = useCallback(() => {
        if (isAdLoaded) {
            adInProgressRef.current = true; // ✅ 광고 시작 플래그 ON
            showAd();
        } else {
            setShowAdOverlay(false);
            postToGame({ type: 'AD_FAILED' });
        }
    }, [isAdLoaded, showAd, postToGame]);

    // 오버레이에서 "건너뛰기" 클릭
    const handleSkip = useCallback(() => {
        adInProgressRef.current = false;
        setShowAdOverlay(false);
        postToGame({ type: 'AD_FAILED' });
    }, [postToGame]);

    return (
        <>
            <iframe
                ref={iframeRef}
                src={`${import.meta.env.BASE_URL}powndry_ms/index.html`}
                style={{
                    position: 'fixed', top: 0, left: 0,
                    width: '100%', height: '100%', border: 'none',
                }}
                title="Powndry Game"
            />
            {showAdOverlay && (
                <AdOverlay
                    isAdLoaded={isAdLoaded}
                    onShowAd={handleShowAd}
                    onSkip={handleSkip}
                />
            )}
        </>
    );
}

export default App;
