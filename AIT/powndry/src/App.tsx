import { useCallback, useEffect, useRef } from 'react';
import { useInAppAds } from './hooks/useInAppAds';

// 실제 발급받은 광고 그룹 ID로 교체하세요
//const AD_GROUP_ID = 'YOUR_AD_GROUP_ID';
const AD_GROUP_ID = "ait.v2.live.e30d47fe7fc54a6c";


function App() {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const { showAd, isSupported, isAdLoaded, lastReward } = useInAppAds(AD_GROUP_ID);

    // iframe에 메시지 보내는 헬퍼
    const postToGame = useCallback((data: object) => {
        iframeRef.current?.contentWindow?.postMessage(data, '*');
    }, []);

    // ✅ isSupported 확정되면 게임에 알려줌
    useEffect(() => {
        // iframe이 로드된 후에 전달해야 하므로 load 이벤트 이후로 지연
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
                if (isAdLoaded) {
                    showAd();
                } else {
                    // 광고가 아직 안 로드됐으면 바로 게임 진입 허용
                    postToGame({ type: 'AD_FAILED' });
                }
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [isAdLoaded, showAd, postToGame]);

    // ✅ 광고 완료(dismissed) 감지 → useInAppAds 훅의 lastReward 또는
    //    dismissed 이벤트로 AD_DONE 전달
    //    훅 내부에서 dismissed 시 isAdLoaded가 false로 바뀌는 것을 활용
    const prevIsAdLoaded = useRef(isAdLoaded);
    useEffect(() => {
        // isAdLoaded: true → false 로 바뀌는 순간 = 광고가 닫힌 시점
        if (prevIsAdLoaded.current === true && isAdLoaded === false) {
            postToGame({ type: 'AD_DONE' });
        }
        prevIsAdLoaded.current = isAdLoaded;
    }, [isAdLoaded, postToGame]);

    return (
        <iframe
            ref={iframeRef}
            src={`${import.meta.env.BASE_URL}powndry_ms/index.html`}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                border: 'none',
            }}
            title="Powndry Game"
        />
    );
}

export default App;
