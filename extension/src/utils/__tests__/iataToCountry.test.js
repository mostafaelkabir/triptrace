import { describe, it, expect } from "vitest";
import { iataToCountry } from "../iataToCountry.js";

describe("iataToCountry", () => {
  it("resolves common US airports", () => {
    expect(iataToCountry("JFK")).toBe("United States");
    expect(iataToCountry("LAX")).toBe("United States");
    expect(iataToCountry("ORD")).toBe("United States");
  });

  it("resolves international airports", () => {
    expect(iataToCountry("IST")).toBe("Turkey");
    expect(iataToCountry("LHR")).toBe("United Kingdom");
    expect(iataToCountry("CDG")).toBe("France");
    expect(iataToCountry("FRA")).toBe("Germany");
    expect(iataToCountry("DXB")).toBe("United Arab Emirates");
  });

  it("is case-insensitive", () => {
    expect(iataToCountry("ist")).toBe("Turkey");
    expect(iataToCountry("lhr")).toBe("United Kingdom");
  });

  it("returns null for unknown codes", () => {
    expect(iataToCountry("ZZZ")).toBeNull();
    expect(iataToCountry("")).toBeNull();
    expect(iataToCountry(null)).toBeNull();
  });

  it("resolves Middle East airports", () => {
    expect(iataToCountry("RUH")).toBe("Saudi Arabia");
    expect(iataToCountry("MCT")).toBe("Oman");
    expect(iataToCountry("BAH")).toBe("Bahrain");
    expect(iataToCountry("KWI")).toBe("Kuwait");
    expect(iataToCountry("AMM")).toBe("Jordan");
    expect(iataToCountry("BEY")).toBe("Lebanon");
    expect(iataToCountry("TLV")).toBe("Israel");
    expect(iataToCountry("DOH")).toBe("Qatar");
  });

  it("resolves South Asian airports", () => {
    expect(iataToCountry("DEL")).toBe("India");
    expect(iataToCountry("BOM")).toBe("India");
    expect(iataToCountry("BLR")).toBe("India");
    expect(iataToCountry("MAA")).toBe("India");
    expect(iataToCountry("HYD")).toBe("India");
    expect(iataToCountry("ISB")).toBe("Pakistan");
    expect(iataToCountry("KTM")).toBe("Nepal");
    expect(iataToCountry("MLE")).toBe("Maldives");
    expect(iataToCountry("CMB")).toBe("Sri Lanka");
    expect(iataToCountry("DAC")).toBe("Bangladesh");
  });

  it("resolves Southeast Asian airports", () => {
    expect(iataToCountry("BKK")).toBe("Thailand");
    expect(iataToCountry("HKT")).toBe("Thailand");
    expect(iataToCountry("SGN")).toBe("Vietnam");
    expect(iataToCountry("HAN")).toBe("Vietnam");
    expect(iataToCountry("KUL")).toBe("Malaysia");
    expect(iataToCountry("SIN")).toBe("Singapore");
    expect(iataToCountry("CGK")).toBe("Indonesia");
    expect(iataToCountry("DPS")).toBe("Indonesia");
    expect(iataToCountry("MNL")).toBe("Philippines");
    expect(iataToCountry("RGN")).toBe("Myanmar");
    expect(iataToCountry("PNH")).toBe("Cambodia");
  });

  it("resolves East Asian airports", () => {
    expect(iataToCountry("NRT")).toBe("Japan");
    expect(iataToCountry("HND")).toBe("Japan");
    expect(iataToCountry("KIX")).toBe("Japan");
    expect(iataToCountry("ICN")).toBe("South Korea");
    expect(iataToCountry("PVG")).toBe("China");
    expect(iataToCountry("PEK")).toBe("China");
    expect(iataToCountry("HKG")).toBe("Hong Kong");
    expect(iataToCountry("TPE")).toBe("Taiwan");
  });

  it("resolves African airports", () => {
    expect(iataToCountry("CAI")).toBe("Egypt");
    expect(iataToCountry("NBO")).toBe("Kenya");
    expect(iataToCountry("ADD")).toBe("Ethiopia");
    expect(iataToCountry("LOS")).toBe("Nigeria");
    expect(iataToCountry("ACC")).toBe("Ghana");
    expect(iataToCountry("DKR")).toBe("Senegal");
    expect(iataToCountry("JNB")).toBe("South Africa");
    expect(iataToCountry("CPT")).toBe("South Africa");
    expect(iataToCountry("CMN")).toBe("Morocco");
  });

  it("resolves South American airports", () => {
    expect(iataToCountry("GRU")).toBe("Brazil");
    expect(iataToCountry("EZE")).toBe("Argentina");
    expect(iataToCountry("SCL")).toBe("Chile");
    expect(iataToCountry("LIM")).toBe("Peru");
    expect(iataToCountry("BOG")).toBe("Colombia");
    expect(iataToCountry("UIO")).toBe("Ecuador");
    expect(iataToCountry("MVD")).toBe("Uruguay");
  });

  it("resolves Oceania airports", () => {
    expect(iataToCountry("SYD")).toBe("Australia");
    expect(iataToCountry("MEL")).toBe("Australia");
    expect(iataToCountry("AKL")).toBe("New Zealand");
    expect(iataToCountry("WLG")).toBe("New Zealand");
    expect(iataToCountry("NAN")).toBe("Fiji");
  });

  it("resolves Caucasus and Central Asian airports", () => {
    expect(iataToCountry("GYD")).toBe("Azerbaijan");
    expect(iataToCountry("TBS")).toBe("Georgia");
    expect(iataToCountry("EVN")).toBe("Armenia");
    expect(iataToCountry("TAS")).toBe("Uzbekistan");
    expect(iataToCountry("ALA")).toBe("Kazakhstan");
  });
});
