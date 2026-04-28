// Pricing Plans — premium-looking 3-tier comparison cards.
// Monthly/yearly toggle, "Most popular" badge on Pro+, "Save X%" badge on yearly.
//
// Used in:
//   - SettingsPage (logged-in users → upgrade flow)
//   - Future: landing page pricing section

import { useState } from 'react';

type Tier = 'premium' | 'pro_plus';

interface PricingPlansProps {
  onSelectStripe: (tier: Tier, interval: 'month' | 'year') => void;
  onSelectEnterprise: () => void;
}

export function PricingPlans({ onSelectStripe, onSelectEnterprise }: PricingPlansProps) {
  const [interval, setInterval] = useState<'month' | 'year'>('month');

  const yearlyDiscount = 17; // ~17% off (10x months for yearly)

  const plans = {
    premium: {
      name: 'Premium',
      tagline: 'Para uso personal intensivo',
      monthlyPrice: 14.99,
      yearlyPrice: 149.99,
      features: [
        '50 notas al día',
        'Audio hasta 30 minutos',
        'Los 9 modos de IA',
        'Chat con IA (100/día)',
        'Exportación PDF y Excel',
        'API personal',
        'Notas compartibles públicamente',
      ],
    },
    pro_plus: {
      name: 'Pro+',
      tagline: 'Para profesionales que graban diario',
      monthlyPrice: 29.99,
      yearlyPrice: 299.99,
      features: [
        '200 notas al día',
        'Audio hasta 60 minutos',
        '8 horas diarias de transcripción',
        'Chat con IA (500/día)',
        'Soporte prioritario (<4h)',
        'Todo lo de Premium',
        'Vocabulario personalizado avanzado',
      ],
    },
    enterprise: {
      name: 'Enterprise',
      tagline: 'Para equipos de 5+ personas',
      features: [
        'Todo ilimitado',
        'Workspaces compartidos',
        'Roles (owner, admin, member)',
        'MCP integrations',
        'API ilimitada',
        'SSO opcional (SAML/OIDC)',
        'Soporte dedicado + onboarding',
      ],
    },
  };

  const formatPrice = (monthly: number, yearly: number) => {
    if (interval === 'month') return monthly.toFixed(2);
    return (yearly / 12).toFixed(2);
  };

  const totalYearly = (yearly: number) => yearly.toFixed(2);

  return (
    <div className="pp-wrap">
      {/* Toggle */}
      <div className="pp-toggle">
        <button
          className={`pp-toggle-btn ${interval === 'month' ? 'active' : ''}`}
          onClick={() => setInterval('month')}
          type="button"
        >
          Mensual
        </button>
        <button
          className={`pp-toggle-btn ${interval === 'year' ? 'active' : ''}`}
          onClick={() => setInterval('year')}
          type="button"
        >
          Anual
          <span className="pp-toggle-save">−{yearlyDiscount}%</span>
        </button>
      </div>

      {/* Cards grid */}
      <div className="pp-grid">
        {/* Premium */}
        <div className="pp-card">
          <div className="pp-card-head">
            <h3 className="pp-name">{plans.premium.name}</h3>
            <p className="pp-tagline">{plans.premium.tagline}</p>
          </div>

          <div className="pp-price">
            <span className="pp-currency">$</span>
            <span className="pp-amount">{formatPrice(plans.premium.monthlyPrice, plans.premium.yearlyPrice)}</span>
            <span className="pp-period">/mes</span>
          </div>

          {interval === 'year' && (
            <p className="pp-billed">
              ${totalYearly(plans.premium.yearlyPrice)} facturado anualmente
            </p>
          )}
          {interval === 'month' && <p className="pp-billed pp-billed-spacer">Facturación mensual flexible</p>}

          <button
            className="pp-cta pp-cta-secondary"
            onClick={() => onSelectStripe('premium', interval)}
            type="button"
          >
            Empezar con Premium
          </button>

          <ul className="pp-features">
            {plans.premium.features.map((f, i) => (
              <li key={i}>
                <CheckIcon />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Pro+ — featured */}
        <div className="pp-card pp-card-featured">
          <div className="pp-badge">Más popular</div>

          <div className="pp-card-head">
            <h3 className="pp-name">{plans.pro_plus.name}</h3>
            <p className="pp-tagline">{plans.pro_plus.tagline}</p>
          </div>

          <div className="pp-price">
            <span className="pp-currency">$</span>
            <span className="pp-amount">{formatPrice(plans.pro_plus.monthlyPrice, plans.pro_plus.yearlyPrice)}</span>
            <span className="pp-period">/mes</span>
          </div>

          {interval === 'year' && (
            <p className="pp-billed">
              ${totalYearly(plans.pro_plus.yearlyPrice)} facturado anualmente
            </p>
          )}
          {interval === 'month' && <p className="pp-billed pp-billed-spacer">Facturación mensual flexible</p>}

          <button
            className="pp-cta pp-cta-primary"
            onClick={() => onSelectStripe('pro_plus', interval)}
            type="button"
          >
            Empezar con Pro+
          </button>

          <ul className="pp-features">
            {plans.pro_plus.features.map((f, i) => (
              <li key={i}>
                <CheckIcon />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Enterprise */}
        <div className="pp-card">
          <div className="pp-card-head">
            <h3 className="pp-name">{plans.enterprise.name}</h3>
            <p className="pp-tagline">{plans.enterprise.tagline}</p>
          </div>

          <div className="pp-price">
            <span className="pp-amount-text">Personalizado</span>
          </div>

          <p className="pp-billed">Precio según equipo y necesidades</p>

          <button
            className="pp-cta pp-cta-secondary"
            onClick={onSelectEnterprise}
            type="button"
          >
            Contactar a ventas
          </button>

          <ul className="pp-features">
            {plans.enterprise.features.map((f, i) => (
              <li key={i}>
                <CheckIcon />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="pp-footer-note">
        Todos los planes incluyen acceso a sythio.app desde web, iOS y Android. Cancela cuando quieras desde Settings.
      </p>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="pp-check" aria-hidden="true">
      <path d="M3.5 8L6.5 11L12.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
