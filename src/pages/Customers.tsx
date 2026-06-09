import React, { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Search,
  Filter,
  MoreHorizontal,
  ShieldAlert,
  Zap,
  Edit2,
  Trash2,
  X,
  Plus,
  Upload,
  Download,
  List,
  Map as MapIcon,
  MapPin,
  Mail,
  MessageCircle,
} from "lucide-react";
import { cn } from "../Layout";
import { useLanguage } from "../i18n";
import ConfirmModal from "../components/ConfirmModal";
import { notify } from "../services/notifications";
import { useServerCollectionSync } from "../hooks/useServerCollectionSync";
import {
  getCustomers,
  saveCustomers,
  deleteCustomer,
  deleteCustomers,
  addCustomer,
  updateCustomer,
  Customer,
  loadCustomersFromServer,
  getPublicLeads,
  loadPublicLeadsFromServer,
  PublicLead,
  savePublicLeads,
  deletePublicLeads,
  claimLead,
  getCurrentUser,
} from "../services/db";

const CONTACT_TYPES = [
  "Mobile",
  "Phone",
  "Email",
  "WhatsApp",
  "Messenger",
  "WeChat",
  "Other",
];

type CsvImportTarget = "my-customers" | "public-pool";
type CustomerViewMode = "list" | "map";

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

type CsvImportPreview = {
  fileName: string;
  headers: string[];
  rows: Record<string, string>[];
};

type CountryStat = {
  country: string;
  count: number;
  x: number;
  y: number;
};

function clampPage(page: number, totalItems: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  return Math.min(Math.max(1, page), totalPages);
}

function paginateItems<T>(items: T[], page: number, pageSize: number) {
  const safePage = clampPage(page, items.length, pageSize);
  const start = (safePage - 1) * pageSize;
  return {
    page: safePage,
    totalPages: Math.max(1, Math.ceil(items.length / pageSize)),
    start,
    end: Math.min(start + pageSize, items.length),
    items: items.slice(start, start + pageSize),
  };
}

function PaginationBar({
  page,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = clampPage(page, totalItems, pageSize);
  const start = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, totalItems);

  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-white/10 dark:bg-black/20 dark:text-slate-300 md:flex-row md:items-center md:justify-between">
      <div>
        Showing <span className="font-semibold">{start}</span>-<span className="font-semibold">{end}</span> of{" "}
        <span className="font-semibold">{totalItems}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-white/10 dark:bg-black/40"
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size} / page
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onPageChange(safePage - 1)}
          disabled={safePage <= 1}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
        >
          Previous
        </button>
        <span className="min-w-20 text-center text-xs font-semibold uppercase tracking-wide text-slate-400">
          {safePage} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(safePage + 1)}
          disabled={safePage >= totalPages}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function contactTypeKey(type = "") {
  return type.trim().toLowerCase();
}

function looksLikeEmail(value = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function inboxComposeHref(channel: "email" | "whatsapp", to: string, customerId?: string, subject?: string) {
  const params = new URLSearchParams({ compose: channel, to });
  if (customerId) params.set("customerId", customerId);
  if (subject) params.set("subject", subject);
  return `/inbox?${params.toString()}`;
}

function getCustomerEmailContact(customer: Customer) {
  const explicit = customer.contacts?.find((contact) => contactTypeKey(contact.type) === "email" && looksLikeEmail(contact.value))?.value;
  if (explicit) return explicit;
  return looksLikeEmail(customer.contact) ? customer.contact : "";
}

function getCustomerWhatsAppContact(customer: Customer) {
  const explicit = customer.contacts?.find((contact) => contactTypeKey(contact.type) === "whatsapp" && contact.value.trim())?.value;
  if (explicit) return explicit;
  return customer.contacts?.find((contact) => ["mobile", "phone"].includes(contactTypeKey(contact.type)) && contact.value.trim())?.value || "";
}

function CustomerContactActions({ customer, compact = false }: { customer: Customer; compact?: boolean }) {
  const email = getCustomerEmailContact(customer);
  const whatsapp = getCustomerWhatsAppContact(customer);
  if (!email && !whatsapp) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5", compact ? "mt-1" : "mt-2")}>
      {whatsapp && (
        <Link
          to={inboxComposeHref("whatsapp", whatsapp, customer.id)}
          className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
          onClick={(event) => event.stopPropagation()}
          title={`WhatsApp ${whatsapp}`}
        >
          <MessageCircle className="h-3 w-3" />
          WhatsApp
        </Link>
      )}
      {email && (
        <Link
          to={inboxComposeHref("email", email, customer.id, `Hello ${customer.name}`)}
          className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300"
          onClick={(event) => event.stopPropagation()}
          title={`Email ${email}`}
        >
          <Mail className="h-3 w-3" />
          Email
        </Link>
      )}
    </div>
  );
}

const COUNTRY_ALIASES: Record<string, string> = {
  afghanistan: "Afghanistan",
  albania: "Albania",
  algeria: "Algeria",
  andorra: "Andorra",
  angola: "Angola",
  antigua_and_barbuda: "Antigua and Barbuda",
  argentina: "Argentina",
  armenia: "Armenia",
  aruba: "Aruba",
  austria: "Austria",
  azerbaijan: "Azerbaijan",
  bahamas: "Bahamas",
  bahrain: "Bahrain",
  bangladesh: "Bangladesh",
  barbados: "Barbados",
  belarus: "Belarus",
  belgium: "Belgium",
  belize: "Belize",
  benin: "Benin",
  bhutan: "Bhutan",
  bolivia: "Bolivia",
  bosnia: "Bosnia and Herzegovina",
  bosnia_and_herzegovina: "Bosnia and Herzegovina",
  botswana: "Botswana",
  brunei: "Brunei",
  bulgaria: "Bulgaria",
  burkina_faso: "Burkina Faso",
  burundi: "Burundi",
  cabo_verde: "Cape Verde",
  cape_verde: "Cape Verde",
  cambodia: "Cambodia",
  cameroon: "Cameroon",
  central_african_republic: "Central African Republic",
  chad: "Chad",
  chile: "Chile",
  colombia: "Colombia",
  comoros: "Comoros",
  congo: "Republic of the Congo",
  republic_of_the_congo: "Republic of the Congo",
  democratic_republic_of_the_congo: "Democratic Republic of the Congo",
  dr_congo: "Democratic Republic of the Congo",
  drc: "Democratic Republic of the Congo",
  costa_rica: "Costa Rica",
  cote_d_ivoire: "Cote d'Ivoire",
  c_te_d_ivoire: "Cote d'Ivoire",
  cote_divoire: "Cote d'Ivoire",
  ivory_coast: "Cote d'Ivoire",
  croatia: "Croatia",
  cyprus: "Cyprus",
  czech_republic: "Czech Republic",
  czechia: "Czech Republic",
  denmark: "Denmark",
  djibouti: "Djibouti",
  dominica: "Dominica",
  dominican_republic: "Dominican Republic",
  ecuador: "Ecuador",
  egypt: "Egypt",
  el_salvador: "El Salvador",
  equatorial_guinea: "Equatorial Guinea",
  eritrea: "Eritrea",
  estonia: "Estonia",
  eswatini: "Eswatini",
  ethiopia: "Ethiopia",
  fiji: "Fiji",
  finland: "Finland",
  gabon: "Gabon",
  gambia: "Gambia",
  georgia: "Georgia",
  ghana: "Ghana",
  grenada: "Grenada",
  greece: "Greece",
  guatemala: "Guatemala",
  guinea: "Guinea",
  guinea_bissau: "Guinea-Bissau",
  guyana: "Guyana",
  haiti: "Haiti",
  honduras: "Honduras",
  hungary: "Hungary",
  iceland: "Iceland",
  ireland: "Ireland",
  israel: "Israel",
  jordan: "Jordan",
  kazakhstan: "Kazakhstan",
  kenya: "Kenya",
  kiribati: "Kiribati",
  kosovo: "Kosovo",
  ksa: "Saudi Arabia",
  kuwait: "Kuwait",
  kyrgyzstan: "Kyrgyzstan",
  laos: "Laos",
  latvia: "Latvia",
  lebanon: "Lebanon",
  lesotho: "Lesotho",
  liberia: "Liberia",
  libya: "Libya",
  liechtenstein: "Liechtenstein",
  lithuania: "Lithuania",
  luxembourg: "Luxembourg",
  macau: "Macau",
  macao: "Macau",
  morocco: "Morocco",
  madagascar: "Madagascar",
  malawi: "Malawi",
  maldives: "Maldives",
  mali: "Mali",
  malta: "Malta",
  mauritania: "Mauritania",
  mauritius: "Mauritius",
  moldova: "Moldova",
  monaco: "Monaco",
  mongolia: "Mongolia",
  montenegro: "Montenegro",
  mozambique: "Mozambique",
  myanmar: "Myanmar",
  namibia: "Namibia",
  nauru: "Nauru",
  nepal: "Nepal",
  nicaragua: "Nicaragua",
  niger: "Niger",
  new_zealand: "New Zealand",
  nigeria: "Nigeria",
  north_macedonia: "North Macedonia",
  norway: "Norway",
  oman: "Oman",
  pakistan: "Pakistan",
  panama: "Panama",
  paraguay: "Paraguay",
  peru: "Peru",
  philippines: "Philippines",
  poland: "Poland",
  qatar: "Qatar",
  romania: "Romania",
  rwanda: "Rwanda",
  saint_kitts_and_nevis: "Saint Kitts and Nevis",
  saint_lucia: "Saint Lucia",
  saint_vincent_and_the_grenadines: "Saint Vincent and the Grenadines",
  samoa: "Samoa",
  san_marino: "San Marino",
  sao_tome_and_principe: "Sao Tome and Principe",
  senegal: "Senegal",
  serbia: "Serbia",
  seychelles: "Seychelles",
  sierra_leone: "Sierra Leone",
  slovakia: "Slovakia",
  slovenia: "Slovenia",
  solomon_islands: "Solomon Islands",
  somalia: "Somalia",
  south_africa: "South Africa",
  south_sudan: "South Sudan",
  sri_lanka: "Sri Lanka",
  sudan: "Sudan",
  suriname: "Suriname",
  sweden: "Sweden",
  switzerland: "Switzerland",
  syria: "Syria",
  taiwan: "Taiwan",
  tajikistan: "Tajikistan",
  tanzania: "Tanzania",
  timor_leste: "Timor-Leste",
  east_timor: "Timor-Leste",
  togo: "Togo",
  tonga: "Tonga",
  trinidad_and_tobago: "Trinidad and Tobago",
  tunisia: "Tunisia",
  uganda: "Uganda",
  ukraine: "Ukraine",
  uruguay: "Uruguay",
  uzbekistan: "Uzbekistan",
  vanuatu: "Vanuatu",
  venezuela: "Venezuela",
  yemen: "Yemen",
  zambia: "Zambia",
  zimbabwe: "Zimbabwe",
  us: "United States",
  usa: "United States",
  u_s_a: "United States",
  "u.s.a.": "United States",
  "u.s.": "United States",
  america: "United States",
  united_states: "United States",
  uk: "United Kingdom",
  u_k: "United Kingdom",
  "u.k.": "United Kingdom",
  britain: "United Kingdom",
  great_britain: "United Kingdom",
  prc: "China",
  cn: "China",
  china: "China",
  mainland_china: "China",
  hk: "Hong Kong",
  hong_kong: "Hong Kong",
  singapore: "Singapore",
  sg: "Singapore",
  germany: "Germany",
  de: "Germany",
  france: "France",
  fr: "France",
  italy: "Italy",
  it: "Italy",
  spain: "Spain",
  es: "Spain",
  canada: "Canada",
  ca_country: "Canada",
  australia: "Australia",
  au: "Australia",
  japan: "Japan",
  jp: "Japan",
  korea: "South Korea",
  south_korea: "South Korea",
  kr: "South Korea",
  india: "India",
  in: "India",
  brazil: "Brazil",
  br: "Brazil",
  mexico: "Mexico",
  mx: "Mexico",
  u_a_e: "United Arab Emirates",
  uae: "United Arab Emirates",
  united_arab_emirates: "United Arab Emirates",
};

const LOCATION_HINTS: Record<string, string> = {
  ca: "United States",
  ny: "United States",
  tx: "United States",
  fl: "United States",
  wa: "United States",
  il: "United States",
  ma: "United States",
  san_francisco: "United States",
  new_york: "United States",
  los_angeles: "United States",
  seattle: "United States",
  chicago: "United States",
  london: "United Kingdom",
  manchester: "United Kingdom",
  toronto: "Canada",
  vancouver: "Canada",
  sydney: "Australia",
  melbourne: "Australia",
  singapore: "Singapore",
  shanghai: "China",
  beijing: "China",
  shenzhen: "China",
  guangzhou: "China",
  hong_kong: "Hong Kong",
  tokyo: "Japan",
  osaka: "Japan",
  seoul: "South Korea",
  mumbai: "India",
  delhi: "India",
  bangalore: "India",
  paris: "France",
  berlin: "Germany",
  munich: "Germany",
  dubai: "United Arab Emirates",
};

const COUNTRY_COORDS: Record<string, { lat: number; lon: number }> = {
  Afghanistan: { lat: 33.9, lon: 67.7 },
  Albania: { lat: 41.2, lon: 20.2 },
  Algeria: { lat: 28.0, lon: 1.7 },
  Andorra: { lat: 42.5, lon: 1.6 },
  Angola: { lat: -11.2, lon: 17.9 },
  "Antigua and Barbuda": { lat: 17.1, lon: -61.8 },
  Argentina: { lat: -38.4, lon: -63.6 },
  Armenia: { lat: 40.1, lon: 45.0 },
  Aruba: { lat: 12.5, lon: -69.9 },
  Austria: { lat: 47.5, lon: 14.6 },
  Azerbaijan: { lat: 40.1, lon: 47.6 },
  Bahamas: { lat: 25.0, lon: -77.4 },
  Bahrain: { lat: 26.1, lon: 50.6 },
  Bangladesh: { lat: 23.7, lon: 90.4 },
  Barbados: { lat: 13.2, lon: -59.5 },
  Belarus: { lat: 53.7, lon: 27.9 },
  Belgium: { lat: 50.5, lon: 4.5 },
  Belize: { lat: 17.2, lon: -88.5 },
  Benin: { lat: 9.3, lon: 2.3 },
  Bhutan: { lat: 27.5, lon: 90.4 },
  Bolivia: { lat: -16.3, lon: -63.6 },
  "Bosnia and Herzegovina": { lat: 44.2, lon: 17.7 },
  Botswana: { lat: -22.3, lon: 24.7 },
  Brunei: { lat: 4.5, lon: 114.7 },
  Bulgaria: { lat: 42.7, lon: 25.5 },
  "Burkina Faso": { lat: 12.2, lon: -1.6 },
  Burundi: { lat: -3.4, lon: 29.9 },
  "Cape Verde": { lat: 16.0, lon: -24.0 },
  Cambodia: { lat: 12.6, lon: 104.9 },
  Cameroon: { lat: 7.4, lon: 12.4 },
  "Central African Republic": { lat: 6.6, lon: 20.9 },
  Chad: { lat: 15.5, lon: 18.7 },
  "United States": { lat: 39.8, lon: -98.6 },
  Canada: { lat: 56.1, lon: -106.3 },
  Mexico: { lat: 23.6, lon: -102.6 },
  Brazil: { lat: -14.2, lon: -51.9 },
  Chile: { lat: -35.7, lon: -71.5 },
  Colombia: { lat: 4.6, lon: -74.1 },
  Comoros: { lat: -11.9, lon: 43.9 },
  "Republic of the Congo": { lat: -0.2, lon: 15.8 },
  "Democratic Republic of the Congo": { lat: -2.9, lon: 23.7 },
  "Costa Rica": { lat: 9.7, lon: -84.2 },
  "Cote d'Ivoire": { lat: 7.5, lon: -5.5 },
  Croatia: { lat: 45.1, lon: 15.2 },
  Cyprus: { lat: 35.1, lon: 33.4 },
  "Czech Republic": { lat: 49.8, lon: 15.5 },
  Denmark: { lat: 56.0, lon: 10.0 },
  Djibouti: { lat: 11.8, lon: 42.6 },
  Dominica: { lat: 15.4, lon: -61.4 },
  "Dominican Republic": { lat: 18.7, lon: -70.2 },
  Ecuador: { lat: -1.8, lon: -78.2 },
  Egypt: { lat: 26.8, lon: 30.8 },
  "El Salvador": { lat: 13.8, lon: -88.9 },
  "Equatorial Guinea": { lat: 1.7, lon: 10.3 },
  Eritrea: { lat: 15.2, lon: 39.8 },
  Estonia: { lat: 58.6, lon: 25.0 },
  Eswatini: { lat: -26.5, lon: 31.5 },
  Ethiopia: { lat: 9.1, lon: 40.5 },
  Fiji: { lat: -17.7, lon: 178.1 },
  Finland: { lat: 61.9, lon: 25.7 },
  Gabon: { lat: -0.8, lon: 11.6 },
  Gambia: { lat: 13.4, lon: -15.3 },
  "United Kingdom": { lat: 55.4, lon: -3.4 },
  France: { lat: 46.2, lon: 2.2 },
  Germany: { lat: 51.2, lon: 10.5 },
  Georgia: { lat: 42.3, lon: 43.4 },
  Ghana: { lat: 7.9, lon: -1.0 },
  Grenada: { lat: 12.1, lon: -61.7 },
  Greece: { lat: 39.1, lon: 21.8 },
  Guatemala: { lat: 15.8, lon: -90.2 },
  Guinea: { lat: 9.9, lon: -9.7 },
  "Guinea-Bissau": { lat: 11.8, lon: -15.2 },
  Guyana: { lat: 4.9, lon: -58.9 },
  Haiti: { lat: 19.0, lon: -72.3 },
  Honduras: { lat: 15.2, lon: -86.2 },
  Hungary: { lat: 47.2, lon: 19.5 },
  Iceland: { lat: 64.9, lon: -19.0 },
  Ireland: { lat: 53.4, lon: -8.2 },
  Italy: { lat: 41.9, lon: 12.6 },
  Spain: { lat: 40.5, lon: -3.7 },
  Israel: { lat: 31.0, lon: 35.0 },
  Jordan: { lat: 31.2, lon: 36.2 },
  Kazakhstan: { lat: 48.0, lon: 67.0 },
  Kenya: { lat: -0.1, lon: 37.9 },
  Kiribati: { lat: 1.9, lon: -157.4 },
  Kosovo: { lat: 42.6, lon: 20.9 },
  Kuwait: { lat: 29.3, lon: 47.5 },
  Kyrgyzstan: { lat: 41.2, lon: 74.8 },
  Laos: { lat: 19.9, lon: 102.5 },
  Latvia: { lat: 56.9, lon: 24.6 },
  Lebanon: { lat: 33.9, lon: 35.9 },
  Lesotho: { lat: -29.6, lon: 28.2 },
  Liberia: { lat: 6.4, lon: -9.4 },
  Libya: { lat: 26.3, lon: 17.2 },
  Liechtenstein: { lat: 47.2, lon: 9.6 },
  Lithuania: { lat: 55.2, lon: 23.9 },
  Luxembourg: { lat: 49.8, lon: 6.1 },
  China: { lat: 35.9, lon: 104.2 },
  "Hong Kong": { lat: 22.3, lon: 114.2 },
  Macau: { lat: 22.2, lon: 113.5 },
  Singapore: { lat: 1.35, lon: 103.8 },
  Japan: { lat: 36.2, lon: 138.3 },
  "South Korea": { lat: 36.5, lon: 127.8 },
  India: { lat: 20.6, lon: 78.9 },
  Indonesia: { lat: -2.5, lon: 118.0 },
  Malaysia: { lat: 4.2, lon: 102.0 },
  Morocco: { lat: 31.8, lon: -7.1 },
  Madagascar: { lat: -18.8, lon: 46.9 },
  Malawi: { lat: -13.3, lon: 34.3 },
  Maldives: { lat: 3.2, lon: 73.2 },
  Mali: { lat: 17.6, lon: -3.9 },
  Malta: { lat: 35.9, lon: 14.4 },
  Mauritania: { lat: 21.0, lon: -10.9 },
  Mauritius: { lat: -20.3, lon: 57.6 },
  Moldova: { lat: 47.4, lon: 28.4 },
  Monaco: { lat: 43.7, lon: 7.4 },
  Mongolia: { lat: 46.9, lon: 103.8 },
  Montenegro: { lat: 42.7, lon: 19.3 },
  Mozambique: { lat: -18.7, lon: 35.5 },
  Myanmar: { lat: 21.9, lon: 95.9 },
  Namibia: { lat: -22.6, lon: 17.1 },
  Nauru: { lat: -0.5, lon: 166.9 },
  Nepal: { lat: 28.4, lon: 84.1 },
  Nicaragua: { lat: 12.9, lon: -85.2 },
  Niger: { lat: 17.6, lon: 8.1 },
  Netherlands: { lat: 52.1, lon: 5.3 },
  "New Zealand": { lat: -40.9, lon: 174.9 },
  Nigeria: { lat: 9.1, lon: 8.7 },
  "North Macedonia": { lat: 41.6, lon: 21.7 },
  Norway: { lat: 60.5, lon: 8.5 },
  Oman: { lat: 21.5, lon: 55.9 },
  Pakistan: { lat: 30.4, lon: 69.3 },
  Panama: { lat: 8.5, lon: -80.8 },
  Paraguay: { lat: -23.4, lon: -58.4 },
  Peru: { lat: -9.2, lon: -75.0 },
  Philippines: { lat: 12.9, lon: 121.8 },
  Poland: { lat: 51.9, lon: 19.1 },
  Portugal: { lat: 39.4, lon: -8.2 },
  Qatar: { lat: 25.4, lon: 51.2 },
  Romania: { lat: 45.9, lon: 24.9 },
  Rwanda: { lat: -1.9, lon: 29.9 },
  "Saint Kitts and Nevis": { lat: 17.4, lon: -62.8 },
  "Saint Lucia": { lat: 13.9, lon: -61.0 },
  "Saint Vincent and the Grenadines": { lat: 13.3, lon: -61.2 },
  Samoa: { lat: -13.8, lon: -172.1 },
  "San Marino": { lat: 43.9, lon: 12.5 },
  "Sao Tome and Principe": { lat: 0.2, lon: 6.6 },
  Russia: { lat: 61.5, lon: 105.3 },
  "Saudi Arabia": { lat: 23.9, lon: 45.1 },
  Senegal: { lat: 14.5, lon: -14.5 },
  Serbia: { lat: 44.0, lon: 20.8 },
  Seychelles: { lat: -4.7, lon: 55.5 },
  "Sierra Leone": { lat: 8.5, lon: -11.8 },
  Slovakia: { lat: 48.7, lon: 19.7 },
  Slovenia: { lat: 46.1, lon: 14.9 },
  "Solomon Islands": { lat: -9.6, lon: 160.2 },
  Somalia: { lat: 5.2, lon: 46.2 },
  "South Africa": { lat: -30.6, lon: 22.9 },
  "South Sudan": { lat: 6.9, lon: 31.3 },
  "Sri Lanka": { lat: 7.9, lon: 80.8 },
  Sudan: { lat: 12.9, lon: 30.2 },
  Suriname: { lat: 4.1, lon: -56.0 },
  Sweden: { lat: 60.1, lon: 18.6 },
  Switzerland: { lat: 46.8, lon: 8.2 },
  Syria: { lat: 34.8, lon: 38.9 },
  Taiwan: { lat: 23.7, lon: 121.0 },
  Tajikistan: { lat: 38.9, lon: 71.0 },
  Tanzania: { lat: -6.4, lon: 34.9 },
  "Timor-Leste": { lat: -8.9, lon: 125.7 },
  Togo: { lat: 8.6, lon: 0.8 },
  Tonga: { lat: -21.2, lon: -175.2 },
  "Trinidad and Tobago": { lat: 10.7, lon: -61.2 },
  Tuvalu: { lat: -7.1, lon: 177.7 },
  Thailand: { lat: 15.9, lon: 101.0 },
  Tunisia: { lat: 34.0, lon: 9.5 },
  Turkey: { lat: 39.0, lon: 35.2 },
  Uganda: { lat: 1.4, lon: 32.3 },
  Ukraine: { lat: 48.4, lon: 31.2 },
  Uruguay: { lat: -32.5, lon: -55.8 },
  Uzbekistan: { lat: 41.4, lon: 64.6 },
  Vanuatu: { lat: -15.4, lon: 166.9 },
  Venezuela: { lat: 6.4, lon: -66.6 },
  Vietnam: { lat: 14.1, lon: 108.3 },
  Yemen: { lat: 15.6, lon: 48.5 },
  Zambia: { lat: -13.1, lon: 27.8 },
  Zimbabwe: { lat: -19.0, lon: 29.2 },
  Australia: { lat: -25.3, lon: 133.8 },
  "United Arab Emirates": { lat: 24.0, lon: 54.0 },
  Unknown: { lat: -58, lon: 0 },
};

const ISO2_COUNTRY_ALIASES: Record<string, string> = {
  ae: "United Arab Emirates",
  af: "Afghanistan",
  ag: "Antigua and Barbuda",
  al: "Albania",
  am: "Armenia",
  ao: "Angola",
  ar: "Argentina",
  aw: "Aruba",
  at: "Austria",
  az: "Azerbaijan",
  ba: "Bosnia and Herzegovina",
  bb: "Barbados",
  bd: "Bangladesh",
  be: "Belgium",
  bf: "Burkina Faso",
  bg: "Bulgaria",
  bh: "Bahrain",
  bi: "Burundi",
  bj: "Benin",
  bn: "Brunei",
  bo: "Bolivia",
  bs: "Bahamas",
  bt: "Bhutan",
  bw: "Botswana",
  bz: "Belize",
  cd: "Democratic Republic of the Congo",
  cf: "Central African Republic",
  cg: "Republic of the Congo",
  ch: "Switzerland",
  ci: "Cote d'Ivoire",
  cl: "Chile",
  cm: "Cameroon",
  co: "Colombia",
  cv: "Cape Verde",
  cr: "Costa Rica",
  dj: "Djibouti",
  dm: "Dominica",
  cy: "Cyprus",
  cz: "Czech Republic",
  dk: "Denmark",
  do: "Dominican Republic",
  dz: "Algeria",
  ec: "Ecuador",
  ee: "Estonia",
  eg: "Egypt",
  er: "Eritrea",
  sz: "Eswatini",
  et: "Ethiopia",
  fj: "Fiji",
  ga: "Gabon",
  gm: "Gambia",
  fi: "Finland",
  ge: "Georgia",
  gh: "Ghana",
  gn: "Guinea",
  gq: "Equatorial Guinea",
  gw: "Guinea-Bissau",
  gy: "Guyana",
  gr: "Greece",
  gt: "Guatemala",
  ht: "Haiti",
  hn: "Honduras",
  hr: "Croatia",
  hu: "Hungary",
  id: "Indonesia",
  ie: "Ireland",
  il: "Israel",
  jo: "Jordan",
  ke: "Kenya",
  kg: "Kyrgyzstan",
  kh: "Cambodia",
  ki: "Kiribati",
  kr: "South Korea",
  kw: "Kuwait",
  kz: "Kazakhstan",
  la: "Laos",
  lb: "Lebanon",
  li: "Liechtenstein",
  lr: "Liberia",
  ls: "Lesotho",
  ly: "Libya",
  mc: "Monaco",
  md: "Moldova",
  mg: "Madagascar",
  mk: "North Macedonia",
  ml: "Mali",
  mn: "Mongolia",
  mt: "Malta",
  mu: "Mauritius",
  mv: "Maldives",
  mw: "Malawi",
  mz: "Mozambique",
  na: "Namibia",
  ne: "Niger",
  ni: "Nicaragua",
  lk: "Sri Lanka",
  lt: "Lithuania",
  lu: "Luxembourg",
  lv: "Latvia",
  ma: "Morocco",
  mm: "Myanmar",
  my: "Malaysia",
  ng: "Nigeria",
  nl: "Netherlands",
  no: "Norway",
  np: "Nepal",
  nz: "New Zealand",
  om: "Oman",
  pa: "Panama",
  pe: "Peru",
  ph: "Philippines",
  pk: "Pakistan",
  pl: "Poland",
  py: "Paraguay",
  qa: "Qatar",
  ro: "Romania",
  rw: "Rwanda",
  sb: "Solomon Islands",
  sc: "Seychelles",
  sd: "Sudan",
  sl: "Sierra Leone",
  sn: "Senegal",
  so: "Somalia",
  ss: "South Sudan",
  st: "Sao Tome and Principe",
  sr: "Suriname",
  rs: "Serbia",
  se: "Sweden",
  si: "Slovenia",
  sk: "Slovakia",
  sy: "Syria",
  tj: "Tajikistan",
  tg: "Togo",
  tl: "Timor-Leste",
  tt: "Trinidad and Tobago",
  tv: "Tuvalu",
  tn: "Tunisia",
  tw: "Taiwan",
  tz: "Tanzania",
  ua: "Ukraine",
  ug: "Uganda",
  uy: "Uruguay",
  uz: "Uzbekistan",
  vc: "Saint Vincent and the Grenadines",
  ve: "Venezuela",
  vu: "Vanuatu",
  xk: "Kosovo",
  ye: "Yemen",
  zm: "Zambia",
  zw: "Zimbabwe",
  za: "South Africa",
};

const WORLD_MAP_SVG_URL = "https://upload.wikimedia.org/wikipedia/commons/5/51/BlankMap-Equirectangular.svg";

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(value.trim());
      value = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(value.trim());
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  row.push(value.trim());
  if (row.some((cell) => cell !== "")) rows.push(row);
  return rows;
}

function normalizeCsvHeader(header: string) {
  return header.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function csvToObjects(text: string) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { headers: rows[0] || [], rows: [] };
  const headers = rows[0].map(normalizeCsvHeader);
  const dataRows = rows.slice(1).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] || ""])),
  );
  return { headers, rows: dataRows };
}

function pickCsv(row: Record<string, string>, aliases: string[]) {
  for (const alias of aliases) {
    const value = row[normalizeCsvHeader(alias)];
    if (value?.trim()) return value.trim();
  }
  return "";
}

function csvTags(value: string) {
  return value
    .split(/[;,|]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function clampScore(value: string, fallback = 50) {
  const parsed = parseInt(value || "", 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(0, Math.min(100, parsed));
}

function normalizeRisk(value: string): Customer["risk"] {
  const text = value.trim().toLowerCase();
  if (text === "high") return "High";
  if (text === "medium") return "Medium";
  return "Low";
}

function buildContactMethods(row: Record<string, string>) {
  return [
    { type: "Email", value: pickCsv(row, ["email", "email_address", "mail"]) },
    { type: "Phone", value: pickCsv(row, ["phone", "phone_number", "tel"]) },
    { type: "Mobile", value: pickCsv(row, ["mobile", "mobile_phone"]) },
    { type: "WhatsApp", value: pickCsv(row, ["whatsapp", "whatsapp_number"]) },
    { type: "Other", value: pickCsv(row, ["website", "site", "url", "linkedin"]) },
  ]
    .filter((contact) => contact.value)
    .map((contact) => ({
      id: Math.random().toString(36).substring(7),
      type: contact.type,
      value: contact.value,
    }));
}

function rowToCustomer(row: Record<string, string>): Customer | null {
  const name = pickCsv(row, ["company", "company_name", "name", "customer", "customer_name", "organization"]);
  const contact = pickCsv(row, ["contact", "contact_name", "person", "name", "email", "phone", "mobile"]);
  if (!name && !contact) return null;
  const contacts = buildContactMethods(row);
  return {
    id: `cus_${Math.random().toString(36).substr(2, 9)}`,
    name: name || contact,
    contact: contact || contacts[0]?.value || name,
    contacts,
    address: pickCsv(row, ["address", "street"]),
    city: pickCsv(row, ["city"]),
    province: pickCsv(row, ["province", "state", "region"]),
    country: pickCsv(row, ["country"]) || inferCountryFromLocation(pickCsv(row, ["location", "address", "city"])),
    preferredLanguage: pickCsv(row, ["preferred_language", "language", "lang"]) || "en",
    description: pickCsv(row, ["description", "notes", "note", "summary"]),
    industry: pickCsv(row, ["industry", "category"]),
    stage: pickCsv(row, ["stage", "pipeline_stage"]) || "New Lead",
    score: clampScore(pickCsv(row, ["score", "priority_score", "ai_score"])),
    risk: normalizeRisk(pickCsv(row, ["risk"])),
    intent: pickCsv(row, ["intent"]) || "Low",
    tags: csvTags(pickCsv(row, ["tags", "tag"])),
    logs: [
      {
        id: Math.random().toString(36).substring(7),
        time: new Date().toISOString(),
        event: "Imported from CSV",
        type: "action",
      },
    ],
    comments: [],
  };
}

function rowToPublicLead(row: Record<string, string>): PublicLead | null {
  const name = pickCsv(row, ["company", "company_name", "name", "lead", "business_name", "organization"]);
  const contact = pickCsv(row, ["contact", "email", "phone", "mobile", "website", "site", "url"]);
  if (!name && !contact) return null;
  return {
    id: `lead_csv_${Math.random().toString(36).substr(2, 9)}`,
    name: name || contact,
    contact: contact || "No contact provided",
    source: pickCsv(row, ["source", "platform"]) || "CSV Import",
    scrapedAt: new Date().toISOString(),
    contacts: buildContactMethods(row),
    industry: pickCsv(row, ["industry", "category"]),
    location: pickCsv(row, ["location", "address", "city", "country"]),
    country: normalizeCountryField(pickCsv(row, ["country"])),
    description: pickCsv(row, ["description", "notes", "note", "summary"]),
    score: pickCsv(row, ["score", "priority_score", "ai_score"]) ? clampScore(pickCsv(row, ["score", "priority_score", "ai_score"])) : undefined,
    intent: (pickCsv(row, ["intent"]) as PublicLead["intent"]) || undefined,
    risk: (pickCsv(row, ["risk"]) as PublicLead["risk"]) || undefined,
  };
}

function csvEscape(value: string | number) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function countryKey(value = "") {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function normalizeCountry(value = "") {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const key = countryKey(trimmed);
  return COUNTRY_ALIASES[key] || COUNTRY_ALIASES[`${key}_country`] || trimmed.replace(/\s+/g, " ");
}

function normalizeCountryField(value = "") {
  const key = countryKey(value);
  if (!key) return "";
  return COUNTRY_ALIASES[key] || ISO2_COUNTRY_ALIASES[key] || normalizeCountry(value);
}

function inferCountryFromLocation(location = "") {
  const parts = location
    .split(/[,|/]/)
    .map((part) => part.trim())
    .filter(Boolean);
  for (const part of [...parts].reverse()) {
    const normalized = normalizeCountry(part);
    const key = countryKey(part);
    if (COUNTRY_COORDS[normalized] || COUNTRY_ALIASES[key]) return normalized;
    if (LOCATION_HINTS[key]) return LOCATION_HINTS[key];
    if (ISO2_COUNTRY_ALIASES[key]) return ISO2_COUNTRY_ALIASES[key];
  }
  for (const part of parts) {
    const hint = LOCATION_HINTS[countryKey(part)];
    if (hint) return hint;
  }
  return "";
}

function getCustomerCountry(customer: Customer) {
  return normalizeCountryField(customer.country || "") || inferCountryFromLocation([customer.city, customer.province, customer.address].filter(Boolean).join(", ")) || "Unknown";
}

function getPublicLeadCountry(lead: PublicLead) {
  return normalizeCountryField(lead.country || "") || inferCountryFromLocation(lead.location || "") || "Unknown";
}

function projectCountryPoint(country: string) {
  const coord = COUNTRY_COORDS[country] || COUNTRY_COORDS.Unknown;
  return {
    x: ((coord.lon + 180) / 360) * 100,
    y: ((90 - coord.lat) / 180) * 100,
  };
}

function getCountryStats<T>(items: T[], getCountry: (item: T) => string) {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    const country = getCountry(item);
    counts.set(country, (counts.get(country) || 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([country, count]) => ({
      country,
      count,
      ...projectCountryPoint(country),
    }))
    .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country));
}

function matchesCountryFilter(country: string, filter: string) {
  if (!filter) return true;
  return countryKey(country) === countryKey(filter);
}

function CustomerFormView({
  customer,
  onSave,
  onClose,
}: {
  key?: React.Key;
  customer: Customer | null;
  onSave: (c: Customer) => void;
  onClose: () => void;
}) {
  const [contacts, setContacts] = useState<Customer["contacts"]>(
    customer?.contacts?.length
      ? customer.contacts
      : [
          {
            id: Math.random().toString(36).substring(7),
            type: "Mobile",
            value: "",
          },
        ],
  );

  const [tags, setTags] = useState<string[]>(customer?.tags || []);

  const handleAddContact = () => {
    setContacts([
      ...contacts,
      {
        id: Math.random().toString(36).substring(7),
        type: "Mobile",
        value: "",
      },
    ]);
  };

  const handleUpdateContact = (
    id: string,
    field: keyof Customer["contacts"][0],
    value: string,
  ) => {
    setContacts(
      contacts.map((c) => (c.id === id ? { ...c, [field]: value } : c)),
    );
  };

  const handleDeleteContact = (id: string) => {
    setContacts(contacts.filter((c) => c.id !== id));
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData);

    onSave({
      id: customer
        ? customer.id
        : `cus_${Math.random().toString(36).substr(2, 9)}`,
      name: data.name as string,
      contact: data.contact as string,
      contacts: contacts.filter((c) => c.value.trim() !== ""),
      address: data.address as string,
      city: data.city as string,
      province: data.province as string,
      description: data.description as string,
      country: data.country as string,
      preferredLanguage: data.preferredLanguage as string,
      stage: data.stage as string,
      score: parseInt(data.score as string, 10),
      risk: data.risk as Customer["risk"],
      intent: data.intent as string,
      tags: tags,
      logs: customer?.logs || [],
      comments: customer?.comments || [],
    } as any);
  };

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden shadow-sm dark:shadow-none">
      <div className="flex justify-between items-center p-6 border-b border-slate-200 dark:border-white/5 shrink-0 bg-slate-50 dark:bg-black/20">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
          {customer ? "Edit Customer" : "Add New Customer"}
        </h2>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <form
        onSubmit={handleSubmit}
        className="p-6 space-y-6 overflow-y-auto flex-1 bg-white dark:bg-transparent"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Company Name
            </label>
            <input
              required
              name="name"
              defaultValue={customer?.name}
              className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Contact Name
            </label>
            <input
              required
              name="contact"
              defaultValue={customer?.contact}
              className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none"
            />
          </div>
        </div>

        <div className="border border-slate-200 dark:border-white/10 rounded-xl p-5 bg-slate-50/50 dark:bg-black/10 space-y-4">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Contact Methods
            </label>
            <button
              type="button"
              onClick={handleAddContact}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors text-xs font-medium"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Method
            </button>
          </div>

          <div className="space-y-3">
            {contacts.map((contact, index) => (
              <div key={contact.id} className="flex items-center gap-3">
                <select
                  value={contact.type}
                  onChange={(e) =>
                    handleUpdateContact(contact.id, "type", e.target.value)
                  }
                  className="w-1/3 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none"
                >
                  {CONTACT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
                <input
                  value={contact.value}
                  onChange={(e) =>
                    handleUpdateContact(contact.id, "value", e.target.value)
                  }
                  placeholder={`Enter ${contact.type}`}
                  className="flex-1 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleDeleteContact(contact.id)}
                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {contacts.length === 0 && (
              <p className="text-xs text-slate-400 italic">
                No contact methods specified.
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Address
            </label>
            <input
              name="address"
              defaultValue={customer?.address}
              className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none"
            />
          </div>
          <div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  City
                </label>
                <input
                  name="city"
                  defaultValue={customer?.city}
                  className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  State / Province
                </label>
                <input
                  name="province"
                  defaultValue={customer?.province}
                  className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Description
            </label>
            <textarea
              name="description"
              defaultValue={customer?.description}
              rows={3}
              className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-3 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none resize-y"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Country
            </label>
            <input
              list="country-list"
              name="country"
              defaultValue={customer?.country}
              className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none"
            />
            <datalist id="country-list">
              {Object.keys(COUNTRY_COORDS)
                .filter((country) => country !== "Unknown")
                .sort((a, b) => a.localeCompare(b))
                .map((country) => (
                  <option key={country} value={country} />
                ))}
            </datalist>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Preferred Language
            </label>
            <select
              name="preferredLanguage"
              defaultValue={customer?.preferredLanguage || ""}
              className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none"
            >
              <option value="">Default (System Language)</option>
              <option value="en">English (en)</option>
              <option value="zh">Chinese (zh)</option>
              <option value="es">Spanish (es)</option>
              <option value="fr">French (fr)</option>
              <option value="de">German (de)</option>
              <option value="ja">Japanese (ja)</option>
              <option value="ko">Korean (ko)</option>
              <option value="ru">Russian (ru)</option>
              <option value="ar">Arabic (ar)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Stage
            </label>
            <select
              name="stage"
              defaultValue={customer?.stage || "New Lead"}
              className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none"
            >
              <option value="New Lead">New Lead</option>
              <option value="Negotiation">Negotiation</option>
              <option value="Qualified">Qualified</option>
              <option value="Closed">Closed</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Score (0-100)
            </label>
            <input
              required
              name="score"
              type="number"
              min="0"
              max="100"
              defaultValue={customer?.score || 50}
              className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Intent
            </label>
            <select
              name="intent"
              defaultValue={customer?.intent || "Low"}
              className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none"
            >
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Risk
            </label>
            <select
              name="risk"
              defaultValue={customer?.risk || "Low"}
              className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none"
            >
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Tags
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {tags.map((tag, idx) => (
                <span
                  key={idx}
                  className="px-3 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs font-medium flex items-center gap-1 border border-blue-200 dark:border-blue-800"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => setTags(tags.filter((_, i) => i !== idx))}
                    className="hover:text-amber-500 ml-1"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
            <input
              placeholder="Add a tag and press Enter..."
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const val = e.currentTarget.value.trim();
                  if (val && !tags.includes(val)) {
                    setTags([...tags, val]);
                    e.currentTarget.value = "";
                  }
                }
              }}
              className="w-full px-4 py-2.5 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all text-sm"
            />
          </div>
        </div>

        <div className="mt-8 flex justify-end gap-3 pt-6 border-t border-slate-200 dark:border-white/5">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors border border-transparent hover:border-slate-200 dark:hover:border-white/10"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors shadow-sm"
          >
            Save Customer
          </button>
        </div>
      </form>
    </div>
  );
}

function CountryMapView({
  stats,
  activeCountry,
  onCountryClick,
  emptyText,
}: {
  stats: CountryStat[];
  activeCountry: string;
  onCountryClick: (country: string) => void;
  emptyText: string;
}) {
  const maxCount = Math.max(1, ...stats.map((stat) => stat.count));

  if (stats.length === 0) {
    return (
      <div className="flex h-full min-h-[420px] flex-col items-center justify-center text-center text-sm text-slate-500 dark:text-slate-400">
        <MapIcon className="mb-3 h-9 w-9 text-slate-300 dark:text-slate-600" />
        {emptyText}
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-[520px] grid-cols-1 gap-0 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="relative min-h-[420px] overflow-hidden bg-slate-100 dark:bg-black/30">
        <div className="absolute inset-6 flex items-center justify-center">
          <div className="relative aspect-[2/1] w-full max-h-full overflow-hidden rounded-[24px] border border-slate-200 bg-sky-50 shadow-inner dark:border-white/10 dark:bg-slate-950">
            <img
              src={WORLD_MAP_SVG_URL}
              alt=""
              aria-hidden="true"
              draggable={false}
              className="absolute inset-0 h-full w-full object-fill opacity-95 dark:opacity-75"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/5 via-transparent to-white/10 dark:from-slate-950/20 dark:via-slate-950/5 dark:to-slate-950/40" />
            <a
              href="https://commons.wikimedia.org/wiki/File:BlankMap-Equirectangular.svg"
              target="_blank"
              rel="noreferrer"
              className="absolute bottom-2 right-2 rounded bg-white/90 px-2 py-1 text-[10px] font-medium text-slate-600 shadow-sm hover:text-blue-600 dark:bg-slate-900/90 dark:text-slate-300"
            >
              Wikimedia Commons
            </a>
            {stats.map((stat, index) => {
              const isActive = matchesCountryFilter(stat.country, activeCountry);
              const size = 18 + Math.round((stat.count / maxCount) * 22);
              const hasKnownPoint = Boolean(COUNTRY_COORDS[stat.country]);
              const left = hasKnownPoint ? stat.x : 8 + (index % 4) * 5;
              const top = hasKnownPoint ? stat.y : 91;
              return (
                <button
                  key={stat.country}
                  type="button"
                  onClick={() => onCountryClick(stat.country)}
                  className={cn(
                    "group absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-xs font-semibold shadow-lg transition-all hover:scale-110",
                    isActive
                      ? "border-blue-200 bg-blue-600 text-white ring-4 ring-blue-500/20"
                      : "border-white bg-emerald-500 text-white hover:bg-blue-600 dark:border-slate-900",
                  )}
                  style={{ left: `${left}%`, top: `${top}%`, width: size, height: size }}
                  title={`${stat.country}: ${stat.count}`}
                  aria-label={`${stat.country}: ${stat.count}`}
                >
                  {stat.count}
                  <span className="pointer-events-none absolute left-1/2 top-full mt-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[10px] font-medium text-white shadow-xl group-hover:block">
                    {stat.country}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="border-t border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-black/20 lg:border-l lg:border-t-0">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-white">
          <MapPin className="h-4 w-4 text-blue-500" />
          Countries
        </div>
        <div className="space-y-2">
          {stats.map((stat) => (
            <button
              key={stat.country}
              type="button"
              onClick={() => onCountryClick(stat.country)}
              className={cn(
                "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                matchesCountryFilter(stat.country, activeCountry)
                  ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300"
                  : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10",
              )}
            >
              <span className="truncate">{stat.country}</span>
              <span className="rounded bg-white px-2 py-0.5 text-xs font-mono text-slate-500 shadow-sm dark:bg-black/30 dark:text-slate-400">
                {stat.count}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Customers() {
  const { t } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentUser = getCurrentUser();
  const canBulkDeletePublicPool = ["admin", "superadmin"].includes(currentUser.role);

  const [activeTab, setActiveTab] = useState<"my-customers" | "public-pool">(
    "my-customers",
  );
  const [customers, setCustomers] = useState<Customer[]>(getCustomers());
  const [publicLeads, setPublicLeads] = useState<PublicLead[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<CustomerViewMode>("list");
  const [countryFilter, setCountryFilter] = useState("");
  const [customerPage, setCustomerPage] = useState(1);
  const [publicLeadPage, setPublicLeadPage] = useState(1);
  const [customerPageSize, setCustomerPageSize] = useState(50);
  const [publicLeadPageSize, setPublicLeadPageSize] = useState(50);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [importTarget, setImportTarget] = useState<CsvImportTarget>("my-customers");
  const [importPreview, setImportPreview] = useState<CsvImportPreview | null>(null);
  const [importError, setImportError] = useState("");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [deletingCustomerId, setDeletingCustomerId] = useState<string | null>(
    null,
  );
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [isBulkDeleteCustomersOpen, setIsBulkDeleteCustomersOpen] = useState(false);
  const [selectedPublicLeadIds, setSelectedPublicLeadIds] = useState<string[]>([]);
  const [isBulkDeletePublicLeadsOpen, setIsBulkDeletePublicLeadsOpen] = useState(false);

  useServerCollectionSync([
    {
      keys: ["crm_customers"],
      loadFromServer: loadCustomersFromServer,
      readFromCache: getCustomers,
      setData: setCustomers,
    },
    {
      keys: ["crm_public_leads"],
      loadFromServer: loadPublicLeadsFromServer,
      readFromCache: getPublicLeads,
      setData: setPublicLeads,
    },
  ]);

  useEffect(() => {
    const editId = searchParams.get("edit");
    if (editId) {
      const c = getCustomers().find((c) => c.id === editId);
      if (c) {
        setEditingCustomer(c);
        setIsModalOpen(true);
      }
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const customerIds = new Set(customers.map((customer) => customer.id));
    setSelectedCustomerIds((current) => current.filter((id) => customerIds.has(id)));
  }, [customers]);

  useEffect(() => {
    const leadIds = new Set(publicLeads.map((lead) => lead.id));
    setSelectedPublicLeadIds((current) => current.filter((id) => leadIds.has(id)));
  }, [publicLeads]);

  useEffect(() => {
    setCustomerPage(1);
    setPublicLeadPage(1);
  }, [searchQuery, countryFilter]);

  const handleAdd = () => {
    setEditingCustomer(null);
    setIsModalOpen(true);
  };

  const openImport = (target: CsvImportTarget) => {
    setImportTarget(target);
    setImportPreview(null);
    setImportError("");
    setIsImportOpen(true);
  };

  const handleCsvFile = async (file?: File) => {
    setImportError("");
    setImportPreview(null);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setImportError("Please select a CSV file.");
      return;
    }
    try {
      const text = await file.text();
      const parsed = csvToObjects(text);
      if (parsed.rows.length === 0) {
        setImportError("No importable rows found. Make sure the first row contains column headers.");
        return;
      }
      setImportPreview({ fileName: file.name, headers: parsed.headers, rows: parsed.rows });
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Failed to parse CSV file.");
    }
  };

  const confirmCsvImport = async () => {
    if (!importPreview) return;

    if (importTarget === "my-customers") {
      const imported = importPreview.rows.map(rowToCustomer).filter(Boolean) as Customer[];
      const existing = getCustomers();
      const existingKeys = new Set(existing.map((item) => `${item.name}|${item.contact}`.toLowerCase()));
      const unique = imported.filter((item) => {
        const key = `${item.name}|${item.contact}`.toLowerCase();
        if (existingKeys.has(key)) return false;
        existingKeys.add(key);
        return true;
      });
      await saveCustomers([...unique, ...existing]);
      setCustomers(await loadCustomersFromServer());
      notify(`Imported ${unique.length} customer(s). ${imported.length - unique.length} duplicate row(s) skipped.`, "success", "CSV import complete");
    } else {
      const imported = importPreview.rows.map(rowToPublicLead).filter(Boolean) as PublicLead[];
      const existing = getPublicLeads();
      const existingKeys = new Set(existing.map((item) => `${item.source}|${item.name}|${item.contact}`.toLowerCase()));
      const unique = imported.filter((item) => {
        const key = `${item.source}|${item.name}|${item.contact}`.toLowerCase();
        if (existingKeys.has(key)) return false;
        existingKeys.add(key);
        return true;
      });
      await savePublicLeads([...unique, ...existing]);
      setPublicLeads(await loadPublicLeadsFromServer());
      notify(`Imported ${unique.length} public lead(s). ${imported.length - unique.length} duplicate row(s) skipped.`, "success", "CSV import complete");
    }

    setIsImportOpen(false);
    setImportPreview(null);
  };

  const downloadSampleCsv = () => {
    const headers = [
      "company",
      "contact",
      "email",
      "phone",
      "website",
      "industry",
      "location",
      "country",
      "tags",
      "score",
      "intent",
      "risk",
      "notes",
      ...(importTarget === "public-pool" ? ["source"] : ["stage", "preferred_language"]),
    ];
    const rows =
      importTarget === "public-pool"
        ? [
            {
              company: "Northstar Dental Group",
              contact: "Mia Chen",
              email: "mia.chen@example.com",
              phone: "+1 415 555 0198",
              website: "https://northstar.example.com",
              industry: "Healthcare",
              location: "San Francisco, CA",
              country: "United States",
              tags: "clinic;high-fit",
              score: 78,
              intent: "Medium",
              risk: "Low",
              notes: "Interested in lightweight CRM automation.",
              source: "CSV Import",
            },
          ]
        : [
            {
              company: "Acme Manufacturing",
              contact: "Jordan Lee",
              email: "jordan.lee@example.com",
              phone: "+1 212 555 0144",
              website: "https://acme.example.com",
              industry: "Manufacturing",
              location: "New York, NY",
              country: "United States",
              tags: "key-account;renewal",
              score: 86,
              intent: "High",
              risk: "Medium",
              notes: "Existing customer, asked about annual volume pricing.",
              stage: "New Lead",
              preferred_language: "en",
            },
          ];
    const csv = [
      headers.join(","),
      ...rows.map((row) => headers.map((header) => csvEscape((row as Record<string, string | number>)[header] || "")).join(",")),
    ].join("\n");
    downloadTextFile(
      importTarget === "public-pool" ? "public-pool-sample.csv" : "my-customers-sample.csv",
      csv,
    );
  };

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    setDeletingCustomerId(id);
  };

  const confirmDelete = () => {
    if (deletingCustomerId) {
      deleteCustomer(deletingCustomerId);
      setCustomers(getCustomers());
      setSelectedCustomerIds((current) => current.filter((id) => id !== deletingCustomerId));
      setDeletingCustomerId(null);
    }
  };

  const confirmBulkDeleteCustomers = async () => {
    if (selectedCustomerIds.length === 0) return;
    await deleteCustomers(selectedCustomerIds);
    setCustomers(await loadCustomersFromServer());
    notify(`Deleted ${selectedCustomerIds.length} customer(s).`, "success", "Customers updated");
    setSelectedCustomerIds([]);
    setIsBulkDeleteCustomersOpen(false);
  };

  const handleSaveCustomer = (newCustomer: Customer) => {
    if (editingCustomer) {
      updateCustomer(editingCustomer.id, newCustomer);
    } else {
      addCustomer(newCustomer as any);
    }
    setCustomers(getCustomers());
    setIsModalOpen(false);
  };

  const filteredCustomers = customers.filter((c) => {
    const q = searchQuery.toLowerCase();
    const country = getCustomerCountry(c);
    return (
      matchesCountryFilter(country, countryFilter) &&
      (c.name.toLowerCase().includes(q) ||
        c.contact.toLowerCase().includes(q) ||
        country.toLowerCase().includes(q) ||
        (c.tags || []).some((t) => t.toLowerCase().includes(q)))
    );
  });

  const filteredPublicLeads = publicLeads.filter((lead) => {
    const q = searchQuery.toLowerCase();
    const country = getPublicLeadCountry(lead);
    return (
      matchesCountryFilter(country, countryFilter) &&
      (lead.name.toLowerCase().includes(q) ||
        lead.source.toLowerCase().includes(q) ||
        lead.contact.toLowerCase().includes(q) ||
        (lead.location || "").toLowerCase().includes(q) ||
        country.toLowerCase().includes(q))
    );
  });

  const countryStats =
    activeTab === "my-customers"
      ? getCountryStats(customers, getCustomerCountry)
      : getCountryStats(publicLeads, getPublicLeadCountry);

  const customerPagination = paginateItems(filteredCustomers, customerPage, customerPageSize);
  const publicLeadPagination = paginateItems(filteredPublicLeads, publicLeadPage, publicLeadPageSize);
  const pagedCustomers = customerPagination.items;
  const pagedPublicLeads = publicLeadPagination.items;

  const visibleCustomerIds = pagedCustomers.map((customer) => customer.id);
  const selectedVisibleCustomerIds = selectedCustomerIds.filter((id) => visibleCustomerIds.includes(id));
  const isAllVisibleCustomersSelected =
    visibleCustomerIds.length > 0 && selectedVisibleCustomerIds.length === visibleCustomerIds.length;

  const toggleCustomerSelection = (customerId: string) => {
    setSelectedCustomerIds((current) =>
      current.includes(customerId)
        ? current.filter((id) => id !== customerId)
        : [...current, customerId],
    );
  };

  const toggleAllVisibleCustomers = () => {
    setSelectedCustomerIds((current) => {
      const visibleIds = new Set(visibleCustomerIds);
      if (isAllVisibleCustomersSelected) {
        return current.filter((id) => !visibleIds.has(id));
      }
      return Array.from(new Set([...current, ...visibleCustomerIds]));
    });
  };

  const visiblePublicLeadIds = pagedPublicLeads.map((lead) => lead.id);
  const selectedVisiblePublicLeadIds = selectedPublicLeadIds.filter((id) => visiblePublicLeadIds.includes(id));
  const isAllVisiblePublicLeadsSelected =
    visiblePublicLeadIds.length > 0 && selectedVisiblePublicLeadIds.length === visiblePublicLeadIds.length;

  const togglePublicLeadSelection = (leadId: string) => {
    setSelectedPublicLeadIds((current) =>
      current.includes(leadId)
        ? current.filter((id) => id !== leadId)
        : [...current, leadId],
    );
  };

  const toggleAllVisiblePublicLeads = () => {
    setSelectedPublicLeadIds((current) => {
      const visibleIds = new Set(visiblePublicLeadIds);
      if (isAllVisiblePublicLeadsSelected) {
        return current.filter((id) => !visibleIds.has(id));
      }
      return Array.from(new Set([...current, ...visiblePublicLeadIds]));
    });
  };

  const confirmBulkDeletePublicLeads = () => {
    if (!canBulkDeletePublicPool || selectedPublicLeadIds.length === 0) return;
    deletePublicLeads(selectedPublicLeadIds);
    setPublicLeads(getPublicLeads());
    setSelectedPublicLeadIds([]);
    notify("Selected public leads have been deleted.", "success", "Public Pool updated");
  };

  const selectCountryOnMap = (country: string) => {
    setCountryFilter(country);
    setViewMode("list");
  };

  return (
    <div className="p-4 md:p-8 h-full flex flex-col gap-6 w-full">
      <div className="flex flex-col gap-6 md:flex-row md:items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">
            {t("cust.title")}
          </h1>
          <p className="text-slate-400 dark:text-slate-500 mt-1 text-sm font-light">
            {t("cust.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-slate-100 dark:bg-white/5 p-1 rounded-lg flex items-center gap-1 border border-slate-200 dark:border-white/10 shadow-inner">
            <button
              onClick={() => {
                setActiveTab("my-customers");
                setCountryFilter("");
                setCustomerPage(1);
                setSelectedPublicLeadIds([]);
              }}
              className={cn(
                "px-4 py-1.5 text-sm font-medium rounded-md transition-all",
                activeTab === "my-customers"
                  ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300",
              )}
            >
              My Customers
            </button>
            <button
              onClick={() => {
                setActiveTab("public-pool");
                setCountryFilter("");
                setPublicLeadPage(1);
                setSelectedCustomerIds([]);
              }}
              className={cn(
                "px-4 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-2",
                activeTab === "public-pool"
                  ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300",
              )}
            >
              Public Pool
              {publicLeads.length > 0 && (
                <span className="bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400 px-1.5 py-0.5 rounded text-[10px]">
                  {publicLeads.length}
                </span>
              )}
            </button>
          </div>
          {!isModalOpen && activeTab === "my-customers" && selectedCustomerIds.length > 0 && (
            <button
              type="button"
              onClick={() => setIsBulkDeleteCustomersOpen(true)}
              className="border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 shadow-sm transition-colors hover:bg-red-100 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20 rounded-lg flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Delete Selected ({selectedCustomerIds.length})
            </button>
          )}
          {!isModalOpen && activeTab === "public-pool" && canBulkDeletePublicPool && selectedPublicLeadIds.length > 0 && (
            <button
              type="button"
              onClick={() => setIsBulkDeletePublicLeadsOpen(true)}
              className="border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 shadow-sm transition-colors hover:bg-red-100 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20 rounded-lg flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Delete Selected ({selectedPublicLeadIds.length})
            </button>
          )}
          {!isModalOpen && (
            <button
              onClick={() => openImport(activeTab)}
              className="border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-50 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 shadow-sm"
            >
              <Upload className="w-4 h-4" />
              Import CSV
            </button>
          )}
          {!isModalOpen && activeTab === "my-customers" && (
            <button
              onClick={handleAdd}
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {t("cust.add")}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0">
        <div
          className={cn(
            "bg-white dark:bg-white/5 shadow-sm dark:shadow-none border border-slate-200 dark:border-white/10 rounded-xl flex flex-col overflow-hidden transition-all duration-300",
            isModalOpen ? "hidden lg:flex lg:w-1/3 shrink-0" : "flex-1",
          )}
        >
          <div className="p-4 border-b border-slate-200 dark:border-white/5 flex gap-4 shrink-0 bg-slate-50 dark:bg-black/20">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder={t("cust.search") + " (or search by tags)"}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500/50 focus:bg-white dark:bg-white/5 shadow-sm dark:shadow-none outline-none transition-all"
              />
            </div>
            {!isModalOpen && (
              <>
                <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm dark:border-white/10 dark:bg-white/5">
                  <button
                    type="button"
                    onClick={() => setViewMode("list")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                      viewMode === "list"
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10",
                    )}
                  >
                    <List className="h-4 w-4" />
                    List
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("map")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                      viewMode === "map"
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10",
                    )}
                  >
                    <MapIcon className="h-4 w-4" />
                    Map
                  </button>
                </div>
                <button className="flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-white/10 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white dark:bg-white/5 shadow-sm dark:shadow-none transition-colors">
                  <Filter className="h-4 w-4" />
                  {t("cust.filters")}
                </button>
              </>
            )}
          </div>
          {countryFilter && !isModalOpen && (
            <div className="flex items-center gap-2 border-b border-slate-200 bg-blue-50 px-4 py-2 text-sm text-blue-700 dark:border-white/10 dark:bg-blue-500/10 dark:text-blue-300">
              <MapPin className="h-4 w-4" />
              <span>
                Country: <strong>{countryFilter}</strong>
              </span>
              <button
                type="button"
                onClick={() => setCountryFilter("")}
                className="ml-auto rounded-md px-2 py-1 text-xs font-medium hover:bg-blue-100 dark:hover:bg-blue-500/20"
              >
                Clear
              </button>
            </div>
          )}

          <div className="overflow-auto flex-1">
            {viewMode === "map" && !isModalOpen ? (
              <CountryMapView
                stats={countryStats}
                activeCountry={countryFilter}
                onCountryClick={selectCountryOnMap}
                emptyText={activeTab === "my-customers" ? "No customer country data yet." : "No public lead location data yet."}
              />
            ) : activeTab === "my-customers" ? (
              <div className="flex min-h-full flex-col">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-white dark:bg-black/40 border-b border-slate-200 dark:border-white/5 sticky top-0 z-10">
                  <tr>
                    {!isModalOpen && (
                      <th className="px-6 py-4 w-12">
                        <input
                          type="checkbox"
                          checked={isAllVisibleCustomersSelected}
                          onChange={toggleAllVisibleCustomers}
                          aria-label="Select all visible customers"
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      </th>
                    )}
                    <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-400 dark:text-slate-500">
                      {t("cust.table.company")}
                    </th>
                    {!isModalOpen && (
                      <>
                        <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-400 dark:text-slate-500">
                          {t("cust.table.contact")}
                        </th>
                        <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-400 dark:text-slate-500">
                          {t("cust.table.stage")}
                        </th>
                        <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-400 dark:text-slate-500">
                          {t("cust.table.score")}
                        </th>
                        <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-400 dark:text-slate-500">
                          {t("cust.table.intentRisk")}
                        </th>
                        <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-400 dark:text-slate-500 text-right">
                          {t("cust.table.actions")}
                        </th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {pagedCustomers.map((c) => (
                    <tr
                      key={c.id}
                      className={cn(
                        "hover:bg-white/[0.04] transition-colors cursor-pointer",
                        editingCustomer?.id === c.id && isModalOpen
                          ? "bg-blue-50/50 dark:bg-blue-900/10"
                          : "",
                      )}
                      onClick={() => isModalOpen && handleEdit(c)}
                    >
                      {!isModalOpen && (
                        <td className="px-6 py-4">
                          <input
                            type="checkbox"
                            checked={selectedCustomerIds.includes(c.id)}
                            onChange={(event) => {
                              event.stopPropagation();
                              toggleCustomerSelection(c.id);
                            }}
                            onClick={(event) => event.stopPropagation()}
                            aria-label={`Select ${c.name}`}
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                        </td>
                      )}
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          {!isModalOpen ? (
                            <Link
                              to={`/customers/${c.id}`}
                              className="font-medium text-slate-900 dark:text-white hover:text-blue-600 dark:text-blue-400 transition-colors"
                            >
                              {c.name}
                            </Link>
                          ) : (
                            <span className="font-medium text-slate-900 dark:text-white">
                              {c.name}
                            </span>
                          )}
                          {!isModalOpen && c.tags && c.tags.length > 0 && (
                            <div className="flex gap-1 mt-1 flex-wrap">
                              {c.tags.map((t) => (
                                <span
                                  key={t}
                                  className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-400"
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}
                          {isModalOpen && (
                            <span className="text-xs text-slate-500">
                              {c.contact}
                            </span>
                          )}
                          {!isModalOpen && <CustomerContactActions customer={c} compact />}
                        </div>
                      </td>
                      {!isModalOpen && (
                        <>
                          <td className="px-6 py-4 text-slate-400 dark:text-slate-500 dark:text-slate-400">
                            {c.contact}
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={cn(
                                "px-2 py-1 rounded text-[10px] font-mono",
                                c.stage === "Negotiation"
                                  ? "bg-purple-900/40 text-purple-400 border border-purple-500/20"
                                  : c.stage === "Qualified"
                                    ? "bg-blue-600/20 text-blue-600 dark:text-blue-400 border border-blue-500/30"
                                    : "bg-white/10 text-slate-400 dark:text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/10",
                              )}
                            >
                              {c.stage}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="h-1.5 w-16 bg-white/10 rounded-full overflow-hidden">
                                <div
                                  className={cn(
                                    "h-full rounded-full shadow-[0_0_10px_rgba(255,255,255,0.2)]",
                                    c.score > 80
                                      ? "bg-emerald-500"
                                      : c.score > 50
                                        ? "bg-amber-500"
                                        : "bg-rose-500",
                                  )}
                                  style={{ width: `${c.score}%` }}
                                />
                              </div>
                              <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
                                {c.score}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex gap-4">
                              <div className="flex items-center gap-1.5">
                                <Zap
                                  className={cn(
                                    "w-3.5 h-3.5",
                                    c.intent === "High"
                                      ? "text-amber-600 dark:text-amber-400"
                                      : "text-slate-600",
                                  )}
                                />
                                <span className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500 dark:text-slate-400">
                                  {c.intent}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <ShieldAlert
                                  className={cn(
                                    "w-3.5 h-3.5",
                                    c.risk === "High"
                                      ? "text-rose-600 dark:text-rose-500"
                                      : "text-slate-600",
                                  )}
                                />
                                <span className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500 dark:text-slate-400">
                                  {c.risk} risk
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEdit(c);
                                }}
                                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded transition-colors"
                              >
                                <Edit2 className="h-4 w-4" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(c.id);
                                }}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-colors"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                  {filteredCustomers.length === 0 && (
                    <tr>
                      <td
                        colSpan={isModalOpen ? 1 : 7}
                        className="px-6 py-12 text-center text-slate-500"
                      >
                        {customers.length === 0
                          ? "No customers yet."
                          : "No customers match the current filters."}
                      </td>
                    </tr>
                  )}
                  </tbody>
                </table>
                {!isModalOpen && (
                  <PaginationBar
                    page={customerPagination.page}
                    totalItems={filteredCustomers.length}
                    pageSize={customerPageSize}
                    onPageChange={setCustomerPage}
                    onPageSizeChange={(size) => {
                      setCustomerPageSize(size);
                      setCustomerPage(1);
                    }}
                  />
                )}
              </div>
            ) : (
              <div className="flex min-h-full flex-col">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-white dark:bg-black/40 border-b border-slate-200 dark:border-white/5 sticky top-0 z-10">
                  <tr>
                    {canBulkDeletePublicPool && (
                      <th className="px-6 py-4 w-12">
                        <input
                          type="checkbox"
                          checked={isAllVisiblePublicLeadsSelected}
                          onChange={toggleAllVisiblePublicLeads}
                          aria-label="Select all visible public leads"
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      </th>
                    )}
                    <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-400 dark:text-slate-500">
                      Lead Info
                    </th>
                    <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-400 dark:text-slate-500">
                      Contact
                    </th>
                    <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-400 dark:text-slate-500">
                      Source
                    </th>
                    <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-400 dark:text-slate-500">
                      Location
                    </th>
                    <th className="px-6 py-4 text-[10px] font-semibold tracking-widest uppercase text-slate-400 dark:text-slate-500 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {pagedPublicLeads.map((lead) => (
                      <tr
                        key={lead.id}
                        className="hover:bg-white/[0.04] transition-colors"
                      >
                        {canBulkDeletePublicPool && (
                          <td className="px-6 py-4">
                            <input
                              type="checkbox"
                              checked={selectedPublicLeadIds.includes(lead.id)}
                              onChange={() => togglePublicLeadSelection(lead.id)}
                              aria-label={`Select ${lead.name}`}
                              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                          </td>
                        )}
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <span className="font-medium text-slate-900 dark:text-white">
                              {lead.name}
                            </span>
                            {lead.industry && (
                              <span className="text-xs text-slate-500">
                                {lead.industry}
                              </span>
                            )}
                            {typeof lead.score === "number" && (
                              <div className="mt-1 space-y-1">
                                <div className="flex items-center gap-2">
                                  <div className="h-1.5 w-14 bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden">
                                    <div
                                      className={cn(
                                        "h-full rounded-full",
                                        lead.score >= 75
                                          ? "bg-emerald-500"
                                          : lead.score >= 55
                                            ? "bg-amber-500"
                                            : "bg-rose-500",
                                      )}
                                      style={{ width: `${lead.score}%` }}
                                    />
                                  </div>
                                  <span className="font-mono text-[10px] text-slate-500">
                                    {lead.score}
                                  </span>
                                  {lead.intent && (
                                    <span className="text-[10px] uppercase tracking-wide text-slate-400">
                                      {lead.intent}
                                    </span>
                                  )}
                                </div>
                                {lead.recommendedAction && (
                                  <span className="block text-[10px] text-slate-500 max-w-xs truncate">
                                    {lead.recommendedAction}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-400 dark:text-slate-500">
                          {lead.contact}
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 rounded text-[10px] font-mono bg-blue-50 text-blue-600 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800">
                            {lead.source}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-400 dark:text-slate-500">
                          {lead.location || "-"}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => {
                              claimLead(lead.id, "user");
                              setPublicLeads(getPublicLeads());
                              setCustomers(getCustomers());
                            }}
                            className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors shadow-sm"
                          >
                            Claim Lead
                          </button>
                        </td>
                      </tr>
                    ))}
                  {filteredPublicLeads.length === 0 && (
                    <tr>
                      <td
                        colSpan={canBulkDeletePublicPool ? 6 : 5}
                        className="px-6 py-12 text-center text-slate-500"
                      >
                        {publicLeads.length === 0
                          ? "No leads currently available in the public pool. Let your Lead Generation agents gather more!"
                          : "No public leads match the current filters."}
                      </td>
                    </tr>
                  )}
                  </tbody>
                </table>
                <PaginationBar
                  page={publicLeadPagination.page}
                  totalItems={filteredPublicLeads.length}
                  pageSize={publicLeadPageSize}
                  onPageChange={setPublicLeadPage}
                  onPageSizeChange={(size) => {
                    setPublicLeadPageSize(size);
                    setPublicLeadPage(1);
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {isModalOpen && (
          <CustomerFormView
            key={editingCustomer?.id || "new"}
            customer={editingCustomer}
            onSave={handleSaveCustomer}
            onClose={() => setIsModalOpen(false)}
          />
        )}

        {isImportOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900 flex flex-col">
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-6 dark:border-white/10">
                <div>
                  <div className="flex items-center gap-2">
                    <Upload className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                      Import CSV to {importTarget === "my-customers" ? "My Customers" : "Public Pool"}
                    </h2>
                  </div>
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                    Supported columns include company/name, contact, email, phone, website, industry, address/location, tags, score, intent, risk, and notes.
                  </p>
                  <button
                    type="button"
                    onClick={downloadSampleCsv}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download Sample CSV
                  </button>
                </div>
                <button
                  onClick={() => setIsImportOpen(false)}
                  className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/5 dark:hover:text-slate-300"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-6 space-y-5">
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center transition-colors hover:border-blue-400 hover:bg-blue-50/40 dark:border-white/10 dark:bg-black/20 dark:hover:border-blue-500/50 dark:hover:bg-blue-500/10">
                  <Upload className="mb-3 h-8 w-8 text-slate-400" />
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Choose a CSV file
                  </span>
                  <span className="mt-1 text-xs text-slate-500">
                    First row must contain column headers.
                  </span>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(event) => handleCsvFile(event.target.files?.[0])}
                  />
                </label>

                {importError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                    {importError}
                  </div>
                )}

                {importPreview && (
                  <div className="rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden">
                    <div className="flex flex-col gap-1 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-black/20">
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        {importPreview.fileName}
                      </span>
                      <span className="text-xs text-slate-500">
                        {importPreview.rows.length} rows detected. Previewing first 5 rows.
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-white dark:bg-black/30">
                          <tr>
                            {(importPreview.headers.length ? importPreview.headers : ["name", "contact"]).slice(0, 8).map((header) => (
                              <th key={header} className="px-4 py-3 font-semibold uppercase tracking-wider text-slate-400">
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                          {importPreview.rows.slice(0, 5).map((row, index) => (
                            <tr key={index}>
                              {(importPreview.headers.length ? importPreview.headers : Object.keys(row)).slice(0, 8).map((header) => (
                                <td key={header} className="max-w-[180px] truncate px-4 py-3 text-slate-600 dark:text-slate-300">
                                  {row[header] || "-"}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 p-6 dark:border-white/10 dark:bg-black/20">
                <button
                  onClick={() => setIsImportOpen(false)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmCsvImport}
                  disabled={!importPreview}
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Upload className="h-4 w-4" />
                  Import CSV
                </button>
              </div>
            </div>
          </div>
        )}

        <ConfirmModal
          isOpen={deletingCustomerId !== null}
          title="Delete Customer"
          message="Are you sure you want to delete this customer? All their associated data will be removed. This action cannot be undone."
          onConfirm={confirmDelete}
          onCancel={() => setDeletingCustomerId(null)}
        />
        <ConfirmModal
          isOpen={isBulkDeleteCustomersOpen}
          title="Delete Customers"
          message={`Delete ${selectedCustomerIds.length} selected customer(s)? This action cannot be undone.`}
          confirmText="Delete Customers"
          onConfirm={confirmBulkDeleteCustomers}
          onCancel={() => setIsBulkDeleteCustomersOpen(false)}
        />
        <ConfirmModal
          isOpen={isBulkDeletePublicLeadsOpen}
          title="Delete Public Pool Leads"
          message={`Delete ${selectedPublicLeadIds.length} selected public lead(s)? This action cannot be undone.`}
          confirmText="Delete Leads"
          onConfirm={confirmBulkDeletePublicLeads}
          onCancel={() => setIsBulkDeletePublicLeadsOpen(false)}
        />
      </div>
    </div>
  );
}
