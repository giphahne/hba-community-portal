// Public GIS locations retrieved October 4, 2026. No pipe alignment inferred.
const DRAIN_REPORT = "https://stormwater.buzzardsbay.org/documents/Wareham-Outfall-Reports.pdf";
const DRAIN_GIS = "https://services6.arcgis.com/y5oiAr7rCKPXyXyu/arcgis/rest/services/StormwaterAGOL_V4_gdb/FeatureServer";
const DRAIN_MAP = "https://experience.arcgis.com/experience/96b1dff06e7c4f378c17dc40acdaa20a/";
const DRAINAGE = [
  {
    id:"WWA1019PI",kind:"outfall",lat:41.74159473745252,lng:-70.71242065335053,objectId:2060,
    location:"Western Worrall Avenue beach outlet",
    detail:"GIS notes: drains to the bay between addresses 3 and 5; if inaccessible, sample catch basin WWA1157CB. An older report describes the west end of Worrall into a creek. Connection to the 1961 easement is not confirmed.",
    facts:"Owner and manager: Private. Circular 8-inch concrete pipe; condition: Good. Inventory date: May 10, 2024. No dated physical inspection recorded.",
    status:"February 11, 2025 recommendation: Private outfall no action required. Wet-weather classification: 1 Illicit Indicators. This is not a beach-water safety finding.",
    evidence:"Report pages 87–88: WWA1157CB samples from September–October 2016; laboratory results are in the Entero. column.",
    pages:"87",scans:["drains/WWA1019PI-088.png"],related:["WWA1157CB"]
  },
  {
    id:"WWA1349PI",kind:"outfall",lat:41.74218593919288,lng:-70.71081956256823,objectId:7739,
    location:"Worrall Avenue, opposite Turner Avenue",
    detail:"GIS notes: drains to the beach opposite Turner Avenue; unable to locate the pipe; sample catch basin WWA1184CB. The marker is the GIS-recorded location, not a field-confirmed visible pipe.",
    facts:"Owner and manager: Private. Circular 8-inch HDPE pipe. Inspection: July 2023, Complete; no illicit connection found. Structure note: Grates need cleaning.",
    status:"February 11, 2025 recommendation: Private outfall and no water quality concerns, table for now. Next action: None Required. This does not document completion of grate cleaning.",
    evidence:"Report pages 153–154: two WWA1184CB samples in 2016 and four no-flow observations.",
    pages:"153",scans:["drains/WWA1349PI-154.png"],related:["WWA1184CB"]
  },
  {
    id:"WWA1030PI",kind:"outfall",lat:41.74313811037225,lng:-70.70934745140914,objectId:1946,
    location:"Eastern beach end of Worrall, near Reynolds Avenue",
    detail:"GIS notes: Worrall Ave at Beach; pipe surfaces at edge of lawn. The catchment report maps this outlet and nearby WWA1210CB.",
    facts:"Owner and manager: Private. Discharges to Beach. Pipe size, material, condition, inventory date and inspection date are not supplied.",
    status:"February 11, 2025 recommendation: Private outfall no action required. Wet-weather classification: 0 Illicit Indicators; dry-weather flow and water quality: No Data. Zero indicators does not mean zero bacteria.",
    evidence:"Report pages 95–96: September 6, 2022 WWA1210CB sump sample; Fecal C. column 1,000 (unit not printed on sheet); nitrate nitrogen 0.51 mg/L. Historical catch-basin sample, not a current beach-water test.",
    pages:"95",scans:["drains/WWA1030PI-095.png","drains/WWA1030PI-096.png"],related:["WWA1210CB"]
  },
  {
    id:"WWA1157CB",kind:"basin",lat:41.7418152078309,lng:-70.71259295842141,objectId:8857,
    location:"Western Worrall Avenue catch basin",
    detail:"Associated with WWA1019PI in the outfall notes and catchment report. Association does not establish an as-built pipe route.",
    facts:"GIS inlet type: Catchbasin. Infiltrating: no. CatchmentID is blank; ownership is not supplied in this inlet layer.",
    evidence:"September 27, 2016 surface sample: Entero. 6,200; October 2016 sump results: 200, <100, 100 and <100. Count unit not printed on sheet. High-salinity sump results require tidal context.",
    pages:"88",scans:["drains/WWA1019PI-088.png"],related:["WWA1019PI"]
  },
  {
    id:"WWA1184CB",kind:"basin",lat:41.742497429722015,lng:-70.71100812469273,objectId:8856,
    location:"Worrall Avenue catch basin near Turner",
    detail:"Associated with WWA1349PI in the outfall notes and catchment report; the outlet notes say to sample this basin when the pipe cannot be located.",
    facts:"GIS inlet type: Catchbasin. Infiltrating: no. CatchmentID is blank; ownership is not supplied in this inlet layer.",
    evidence:"2016 report samples: September 27 surface Entero. 2,700; October 24 sump Entero. 3,100. Count unit not printed on sheet; not current beach-water measurements.",
    pages:"154",scans:["drains/WWA1349PI-154.png"],related:["WWA1349PI"]
  },
  {
    id:"WWA1210CB",kind:"basin",lat:41.743003261259474,lng:-70.70970839334427,objectId:8854,
    location:"Worrall Avenue catch basin near Reynolds",
    detail:"Mapped and sampled under the WWA1030PI catchment report. This is the sampling location, not the outlet mouth.",
    facts:"GIS inlet type: Catchbasin. Infiltrating: no. CatchmentID is blank; ownership is not supplied in this inlet layer.",
    evidence:"September 6, 2022 sump sample 2WA06SEP06-A: Fecal C. 1,000 (unit not printed); laboratory nitrate nitrogen 0.51 mg/L; salinity 0.01 ppt; previous 48-hour rainfall 1.75 inches.",
    pages:"96",scans:["drains/WWA1030PI-096.png"],related:["WWA1030PI"]
  },
  {
    id:"WWA1191CB",kind:"basin",lat:41.742633065491155,lng:-70.7106838365911,objectId:8920,
    location:"Worrall Avenue, west of Reynolds Avenue",
    detail:"Labeled on the WWA1030PI report map. No specific outfall association or sampling record was established for this basin in the records reviewed.",
    facts:"GIS inlet type: Catchbasin. Infiltrating: no. CatchmentID is blank; ownership is not supplied in this inlet layer.",
    evidence:"Map label on report page 95. Do not assume this basin drains to WWA1030PI solely because it appears on that map.",
    pages:"95",scans:["drains/WWA1030PI-095.png"],related:[]
  }
];
