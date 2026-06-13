import turkishAirlines from "./turkishAirlines.js";
import lufthansa from "./lufthansa.js";
import united from "./united.js";
import delta from "./delta.js";
import american from "./american.js";
import emirates from "./emirates.js";
import airFrance from "./airFrance.js";
import britishAirways from "./britishAirways.js";
import qatar from "./qatar.js";
import southwest from "./southwest.js";
import jetblue from "./jetblue.js";
import alaska from "./alaska.js";
import etihad from "./etihad.js";
import singapore from "./singapore.js";
import { expedia, kayak, googleFlights, bookingCom } from "./aggregators.js";

export const parsers = [
  turkishAirlines, lufthansa, united, delta, american,
  emirates, airFrance, britishAirways,
  qatar, southwest, jetblue, alaska, etihad, singapore,
  expedia, kayak, googleFlights, bookingCom,
];
