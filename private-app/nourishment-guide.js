(() => {
  'use strict';
  const links={
    local:'https://www.wareham.gov/DocumentCenter/View/8419/Town-By--Laws-Revised-August-2025-PDF',
    commission:'https://www.wareham.gov/179/Conservation-Commission',
    coastal:'https://www.mass.gov/info-details/environmental-permitting-in-coastal-massachusetts',
    wqc:'https://www.mass.gov/info-details/401-water-quality-certification-of-the-nationwide-permits-and-general-permits',
    dune:'https://www.mass.gov/info-details/stormsmart-properties-fact-sheet-1-artificial-dunes-and-dune-nourishment',
    bmp:'https://www.mass.gov/doc/beach-nourishment-massdeps-guide-to-best-management-practices-for-projects-in-ma/download',
    grants:'https://www.mass.gov/info-details/coastal-resilience-grant-program',
    catalogue:'https://www.mass.gov/info-details/environment-climate-one-stop-eco-one-stop-grants-catalogue'
  };
  const a=(key,title)=>`<a href="${links[key]}" target="_blank" rel="noopener">${title}</a>`;
  const dialog=document.createElement('dialog');dialog.id='nourishment-guide-dialog';dialog.setAttribute('aria-labelledby','ng-title');
  dialog.innerHTML=`<div class="ng-shell"><header><div><p>Official-source research · Checked October 17, 2026</p><h2 id="ng-title">Beach nourishment: a practical path</h2></div><button type="button" id="ng-close">Back to records</button></header><div class="ng-content">
    <p>This is a planning checklist, not a legal opinion, site-specific permit determination or engineered design. Existing licenses, beach-use rights, property ownership and permission to place sand are different questions.</p>
    <h3>Start with the local rules</h3>
    <p>Wareham’s Wetland Protective By-Law independently protects coastal beaches, dunes, shellfish resources, other listed wetlands and a 100-foot buffer, and requires Commission authorization for regulated alteration. See Division VI, Article I in the ${a('local','August 2025 compiled town bylaws')}.</p>
    <p>The Commission uses online applications and requires project elements to be staked when submitting an application; inadequate staking can delay review. Use the ${a('commission','Wareham Conservation Commission application guidance')}.</p>
    <h3>State and federal review: screen each, do not assume every permit applies</h3>
    <ul>
      <li><strong>Wetlands:</strong> Coastal work commonly requires review under the Massachusetts Wetlands Protection Act as well as local rules. Confirm the filing route with the Commission and the ${a('dune','CZM coastal nourishment guidance')}.</li>
      <li><strong>Chapter 91:</strong> Work below mean high water may require a waterways authorization, separate from wetlands approval. Confirm the exact footprint and scope using the ${a('dune','CZM permitting guidance')}.</li>
      <li><strong>US Army Corps and water quality:</strong> The applicable federal authorization and Massachusetts Section 401 certification must both be checked. MassDEP’s 2026 Nationwide Permit certification took effect March 15, 2026; some projects still require an individual certification even without notification to the Corps. GP 7 for dredging, disposal and beach nourishment remains among the listed regional permits available for new authorizations, subject to eligibility and certification conditions. Ask the Corps which route applies rather than assuming a small-volume exemption. ${a('wqc','Current MassDEP 401/Nationwide and Regional Permit guidance')}.</li>
      <li><strong>Additional screening:</strong> MEPA, federal consistency, rare species, marine fisheries, historic resources and other requirements depend on the project, location, funding and agency actions. The ${a('coastal','CZM permit overview, revised 2021')} is an index, not a substitute for checking current regulations and agency requirements.</li>
      <li><strong>Habitat and timing:</strong> Nourishment must consider shellfish, eelgrass, rare species and horseshoe-crab spawning habitat; work timing is site- and permit-specific. Do not treat HBA’s June cleaning pause as a universal legal ban or permission for other work. See ${a('dune','CZM habitat and work-window guidance')}.</li>
    </ul>
    <h3>Design evidence that makes an application stronger</h3>
    <p>Characterize the receiving beach and proposed sand, establish profiles and baseline conditions, show placement quantities and access, avoid sensitive habitat and plan monitoring. These are technical planning recommendations from the ${a('bmp','MassDEP Beach Nourishment BMP Guide, March 2007')} and ${a('dune','CZM dune and nourishment guidance')}; the older BMP guide is not evidence of current permit thresholds.</p>
    <p>Compare nourishment and nature-based alternatives before assuming a new jetty is the preferred answer; coastal structures face separate restrictions and alternatives review. Obtain a coastal engineer’s or geologist’s design and current agency advice, as recommended by ${a('dune','CZM StormSmart guidance')}.</p>
    <h3>Funding leads, not awarded income</h3>
    <ul>
      <li><strong>CZM Coastal Resilience:</strong> The program lists coastal municipalities, certified 501(c)(3) nonprofits and Massachusetts Tribes as eligible applicants. Shoreline restoration must be on publicly accessible property and address erosion/flood impacts to public facilities or infrastructure; association membership alone does not prove eligibility. ${a('grants','CZM Coastal Resilience eligibility and project requirements')}.</li>
      <li><strong>Timing:</strong> The FY2028 page lists the optional expression-of-interest window as September 8–October 16, with formal applications expected in early 2027. Do not label that expression-of-interest window open or promise HBA an award; ask program staff about the next step and current solicitation. ${a('grants','CZM current grant cycle')}.</li>
      <li><strong>Town partnership:</strong> Explore a Wareham-led or eligible municipal-partner proposal. The ECO catalogue lists municipal/Tribal and qualifying public/regional applicants for MVP Action, with planning alignment and partnership conditions. ${a('catalogue','ECO One Stop programme eligibility')}.</li>
      <li><strong>Other programmes:</strong> Coastal Habitat and Water Quality projects must fit habitat/water-quality objectives, while dam/seawall programmes have structure- and applicant-specific limits. Neither is a general promise to pay for HBA sand placement or private jetties. ${a('catalogue','ECO One Stop grants catalogue')}.</li>
    </ul>
    <h3>Suggested HBA route to a defensible proposal</h3>
    <ol>
      <li><strong>Assemble the evidence:</strong> Confirm landowner consent, public access, current permit files and HBA authorization. Keep unresolved title and license questions visible.</li>
      <li><strong>Meet before designing:</strong> Ask Wareham’s Conservation Agent for a pre-application discussion; include a coastal professional and request state/federal coordination where needed.</li>
      <li><strong>Choose a measured concept:</strong> Define the erosion problem, infrastructure and habitat benefits, alternatives, placement footprint, sand specification, access and seasonal constraints.</li>
      <li><strong>Build a permit matrix:</strong> For every possible review, record the agency’s written applicability advice, filing, decision, conditions, expiry and monitoring obligations. An old approval does not establish current authorization.</li>
      <li><strong>Find the eligible applicant:</strong> Confirm HBA’s IRS classification and the project’s public-access terms. Discuss a municipal partnership before preparing a grant budget.</li>
      <li><strong>Fund in phases:</strong> Separate survey/design/permitting from construction and ongoing monitoring. Count grants in the budget only once awarded, and keep a no-grant affordability case.</li>
    </ol>
    <p>The sequence above is a suggested workflow, not a finding that a particular permit or grant will be approved. Pre-application coordination is supported by the ${a('coastal','CZM permit guide')}; public-benefit and applicant checks follow the ${a('grants','Coastal Resilience requirements')}.</p>
    <h3>Information HBA still needs to confirm</h3>
    <p>IRS determination and tax classification; ownership/consent for the exact project area; public-access obligations; executed/current permits and their conditions; coastal survey and compatible-sand specification; design, maintenance and monitoring costs. These remain open questions, not completed findings or grant commitments.</p>
    </div></div>`;
  document.body.append(dialog);
  const button=document.createElement('button');button.type='button';button.id='nourishment-guide-open';button.textContent='Rules, grants & suggested path';
  button.onclick=()=>dialog.showModal();
  document.getElementById('nourishment-close').before(button);
  document.getElementById('ng-close').onclick=()=>dialog.close();
  window.openNourishmentGuide=()=>dialog.showModal();
})();
