// On-screen words for the "How to play" walkthrough, in English and Hindi.
// (The spoken narration is in narration.json → rendered to audio clips.)

export type Lang = 'en' | 'hi';

interface Words {
  steps: { title: string; text: string }[];
  ui: {
    howToPlay: string;
    watchAgain: string;
    letsPlay: string;
    intro: string;
    zoneChip: string;
    pingToast: string;
    nobodyThere: string;
    spotToast: string;
    kabirShows: string;
    amanScans: string;
    caughtToast: string;
    runsFar: string;
    sosSub: string;
    survived: string;
  };
  map: {
    oldPing: (name: string) => string;
    somewhere: (name: string) => string;
    frozen: string;
  };
}

export const WORDS: Record<Lang, Words> = {
  en: {
    steps: [
      { title: 'Hunter Seeker', text: 'Hide and seek for real — across your neighbourhood, with live GPS pings on your phones.' },
      { title: 'Draw the zone', text: 'The host draws the play area on the map. Everyone has to stay inside it.' },
      { title: 'Pick your roles', text: 'Hiders hide. Hunters chase and catch. Seekers scout and spot.' },
      { title: 'Head start', text: 'Hiders run off to hide while the hunters and seekers wait at the start.' },
      { title: 'Ping!', text: 'Every few minutes, each hider’s exact spot pings to the hunters. Run there!' },
      { title: 'Move after the ping', text: 'Hiders, move right after a ping — you’re invisible until the next one.' },
      { title: 'Seekers see circles', text: 'Seekers only get a rough circle around each hider — but they get it more often.' },
      { title: 'Spot!', text: 'See a hider? Seekers tap Spot. If they’re really close, the hunters get the exact location.' },
      { title: 'Catch', text: 'Tag the hider, then scan the code on their phone. They’re out!' },
      { title: 'Stay in the zone', text: 'Leave the zone and you’re frozen. Hiders who leave get broadcast to everyone.' },
      { title: 'Safety first', text: 'Anyone can pause or send an SOS. The clock stops for everyone.' },
      { title: 'Who wins?', text: 'Hiders win if anyone survives the clock. Hunters win by catching every hider.' },
    ],
    ui: {
      howToPlay: 'HOW TO PLAY',
      watchAgain: 'Watch again',
      letsPlay: 'Let’s play',
      intro: '4 friends · 1 neighbourhood · 1 hour',
      zoneChip: 'Zone: 800 m across · 60 min hunt',
      pingToast: 'Ping! Priya and Kabir revealed to hunters',
      nobodyThere: 'Aman reached the old ping… nobody there!',
      spotToast: 'Rahul spotted Kabir! Exact spot sent to hunters',
      kabirShows: 'Kabir shows his catch code',
      amanScans: 'Aman scans it — it changes every 30 s so it can’t be faked.',
      caughtToast: 'Kabir was caught by Aman',
      runsFar: 'Aman runs a bit too far…',
      sosSub: 'Game paused for everyone · his location is on the map',
      survived: 'Priya survived the whole hunt!',
    },
    map: {
      oldPing: (n) => `${n}’s old ping`,
      somewhere: (n) => `${n} is somewhere here`,
      frozen: 'frozen',
    },
  },
  hi: {
    steps: [
      { title: 'हंटर सीकर', text: 'असली लुका-छिपी — पूरे मोहल्ले में, फ़ोन पर लाइव GPS पिंग के साथ।' },
      { title: 'ज़ोन बनाओ', text: 'होस्ट मैप पर खेलने का एरिया बनाता है। सबको इसी ज़ोन के अंदर रहना है।' },
      { title: 'रोल चुनो', text: 'हाइडर्स छिपते हैं। हंटर्स पीछा करके पकड़ते हैं। सीकर्स ढूँढते हैं और स्पॉट करते हैं।' },
      { title: 'हेड स्टार्ट', text: 'हाइडर्स भागकर छिपते हैं, तब तक हंटर्स और सीकर्स शुरुआत की जगह पर रुकते हैं।' },
      { title: 'पिंग!', text: 'हर कुछ मिनट में हर हाइडर की सही लोकेशन हंटर्स को पिंग होती है। वहाँ भागो!' },
      { title: 'पिंग के बाद जगह बदलो', text: 'हाइडर्स, पिंग होते ही जगह बदलो — अगले पिंग तक तुम किसी को नहीं दिखोगे।' },
      { title: 'सीकर्स को सर्कल दिखता है', text: 'सीकर्स को सिर्फ़ एक मोटा-मोटा सर्कल दिखता है — लेकिन बार-बार।' },
      { title: 'स्पॉट!', text: 'हाइडर दिख गया? सीकर स्पॉट दबाए। सच में पास हो, तो हंटर्स को सही लोकेशन मिल जाती है।' },
      { title: 'कैच', text: 'हाइडर को छुओ, फिर उसके फ़ोन का कोड स्कैन करो। वो आउट!' },
      { title: 'ज़ोन के अंदर रहो', text: 'ज़ोन से बाहर गए तो फ़्रीज़। हाइडर बाहर गया तो उसकी लोकेशन सबको दिख जाती है।' },
      { title: 'सेफ़्टी पहले', text: 'कोई भी गेम पॉज़ कर सकता है या SOS भेज सकता है। सबकी घड़ी रुक जाती है।' },
      { title: 'कौन जीता?', text: 'एक भी हाइडर आख़िर तक बचा तो हाइडर्स जीते। सबको पकड़ लिया तो हंटर्स जीते।' },
    ],
    ui: {
      howToPlay: 'कैसे खेलें',
      watchAgain: 'फिर से देखो',
      letsPlay: 'चलो खेलें',
      intro: '4 दोस्त · 1 मोहल्ला · 1 घंटा',
      zoneChip: 'ज़ोन: 800 मीटर · 60 मिनट का खेल',
      pingToast: 'पिंग! Priya और Kabir हंटर्स को दिख गए',
      nobodyThere: 'Aman पुराने पिंग पर पहुँचा… वहाँ कोई नहीं!',
      spotToast: 'Rahul ने Kabir को स्पॉट किया! लोकेशन हंटर्स को गई',
      kabirShows: 'Kabir अपना कैच कोड दिखाता है',
      amanScans: 'Aman उसे स्कैन करता है — कोड हर 30 सेकंड बदलता है, इसलिए नकली नहीं चलेगा।',
      caughtToast: 'Kabir को Aman ने पकड़ लिया',
      runsFar: 'Aman ज़ोन से थोड़ा ज़्यादा दूर भाग गया…',
      sosSub: 'सबके लिए गेम रुका · उसकी लोकेशन मैप पर है',
      survived: 'Priya पूरे गेम में बची रही!',
    },
    map: {
      oldPing: (n) => `${n} का पुराना पिंग`,
      somewhere: (n) => `${n} यहीं कहीं है`,
      frozen: 'फ़्रीज़',
    },
  },
};
