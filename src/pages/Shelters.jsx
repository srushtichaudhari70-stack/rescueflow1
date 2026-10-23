import { useApp } from '../context/AppContext.jsx';
import ShelterCard from '../components/ShelterCard.jsx';
import { RESOURCES } from '../data/constants.js';

export default function Shelters() {
  const { state } = useApp();
  const open = state.shelters.filter((s) => s.status === 'Open').length;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Shelters & relief camps</h1>
          <p>
            {open} of {state.shelters.length} shelters open. Demand counts deliveries already on the way, so no shelter is ever over-served.
            Changing demand or closing a shelter immediately re-checks riders heading there.
          </p>
        </div>
      </div>
      <div className="callout gray" style={{ marginBottom: 16 }}>
        <div>
          <b style={{ color: 'var(--text)' }}>Resource dependencies:</b> raw ration kits need {RESOURCES.cleanWater.toLowerCase()} + {RESOURCES.cookingFuel.toLowerCase()} ·
          infant formula needs {RESOURCES.cleanWater.toLowerCase()} + {RESOURCES.sterilePrep.toLowerCase()} · medical supplies need {RESOURCES.medicalStaff.toLowerCase()} ·
          refrigerated items need {RESOURCES.refrigeration.toLowerCase()}. Crossed-out chips are missing.
        </div>
      </div>
      <div className="entity-grid">
        {state.shelters.map((sh) => <ShelterCard key={sh.id} shelter={sh} />)}
      </div>
    </div>
  );
}
