"use client";

export default function ReceiptForecastFilterLayoutFixV22() {
  return (
    <style jsx global>{`
      .receipt-forecast-active-v13 .forecast-filter-v13 {
        display: grid !important;
        grid-template-columns: 170px minmax(280px, 1.7fr) minmax(170px, .8fr) minmax(210px, 1fr) auto;
        grid-template-areas:
          "title client client month month"
          "week week confidence pending clear";
        align-items: end !important;
        gap: 10px !important;
      }

      .receipt-forecast-active-v13 .forecast-filter-title-v13 {
        grid-area: title;
        min-width: 0 !important;
        margin-right: 0 !important;
        align-self: center;
      }

      .receipt-forecast-active-v13 .forecast-filter-v13 > label:nth-of-type(1) {
        grid-area: client;
      }

      .receipt-forecast-active-v13 .forecast-filter-v13 > label:nth-of-type(2) {
        grid-area: month;
      }

      .receipt-forecast-active-v13 .forecast-filter-v13 > label:nth-of-type(3) {
        grid-area: week;
      }

      .receipt-forecast-active-v13 .forecast-filter-v13 > label:nth-of-type(4) {
        grid-area: confidence;
      }

      .receipt-forecast-active-v13 .forecast-filter-v13 > label,
      .receipt-forecast-active-v13 .forecast-filter-v13 > label > div,
      .receipt-forecast-active-v13 .forecast-filter-v13 select {
        width: 100% !important;
        min-width: 0 !important;
      }

      .receipt-forecast-active-v13 .forecast-filter-v13 .forecast-only-pending-button-v16 {
        grid-area: pending;
        width: 100%;
        min-width: 0;
      }

      .receipt-forecast-active-v13 .forecast-filter-v13 > button:not(.forecast-only-pending-button-v16) {
        grid-area: clear;
        justify-self: start;
        white-space: nowrap;
      }

      @media (max-width: 1050px) {
        .receipt-forecast-active-v13 .forecast-filter-v13 {
          grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
          grid-template-areas:
            "title title"
            "client month"
            "week confidence"
            "pending clear";
        }
      }

      @media (max-width: 760px) {
        .receipt-forecast-active-v13 .forecast-filter-v13 {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          grid-template-areas:
            "title title"
            "client month"
            "week confidence"
            "pending clear" !important;
          align-items: end !important;
          gap: 8px !important;
        }

        .receipt-forecast-active-v13 .forecast-filter-title-v13 {
          grid-column: 1 / -1 !important;
          padding-bottom: 2px;
        }

        .receipt-forecast-active-v13 .forecast-filter-v13 > label {
          min-width: 0 !important;
        }

        .receipt-forecast-active-v13 .forecast-filter-v13 > label > span {
          display: block;
          margin-bottom: 5px;
          font-size: 8px !important;
          letter-spacing: .035em;
          white-space: nowrap;
        }

        .receipt-forecast-active-v13 .forecast-filter-v13 > label > div,
        .receipt-forecast-active-v13 .forecast-filter-v13 select {
          min-width: 0 !important;
          width: 100% !important;
        }

        .receipt-forecast-active-v13 .forecast-filter-v13 select {
          font-size: 10.5px !important;
          text-overflow: ellipsis;
        }

        .receipt-forecast-active-v13 .forecast-filter-v13 .forecast-only-pending-button-v16,
        .receipt-forecast-active-v13 .forecast-filter-v13 > button:not(.forecast-only-pending-button-v16) {
          width: 100% !important;
          min-width: 0 !important;
          justify-content: center !important;
          justify-self: stretch !important;
          padding-left: 8px !important;
          padding-right: 8px !important;
          white-space: nowrap;
        }
      }

      @media (max-width: 340px) {
        .receipt-forecast-active-v13 .forecast-filter-v13 {
          grid-template-columns: 1fr !important;
          grid-template-areas:
            "title"
            "client"
            "month"
            "week"
            "confidence"
            "pending"
            "clear" !important;
        }
      }
    `}</style>
  );
}
