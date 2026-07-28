/**
 * Special Antarctica queue: research-station / scientific / educational continuous official feeds only.
 */
import type { WorldwideRadioCountry } from "@/lib/radioWorldwideExpansion/types";

export const ANTARCTICA_RADIO_QUEUE: WorldwideRadioCountry[] = [
  {
    code: "AQ",
    name: "Antarctica",
    continent: "antarctica",
    aliases: ["Antarctic"],
    cities: ["McMurdo Station","Amundsen-Scott South Pole Station","Palmer Station","Rothera Research Station","Halley Research Station","Concordia Station","Casey Station","Davis Station","Mawson Station","Princess Elisabeth Station","Syowa Station","Zhongshan Station","Great Wall Station","Bellingshausen Station","Esperanza Base","Marambio Base","Vernadsky Research Base","Neumayer Station III","Troll Station"],
    languages: ["english","spanish","russian","french","german","norwegian","chinese","japanese","korean","italian"],
    tags: ["antarctica","research","scientific","educational","public","arctic","polar"],
    notes: ["Only lawful public research/educational continuous official broadcast feeds apply","No webcams, finite recordings, tourist streams, or private station audio","Prefer official national Antarctic program or scientific institution continuous radio feeds when publicly licensed"],
  },
];
