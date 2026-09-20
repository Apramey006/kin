//! HTTP front for the Kin brain.
//!
//! Exposes the scoring decisions the Next.js app delegates: the app still
//! owns its Supabase queries and assembles the evidence, this service scores
//! it. Same boundary as face-service, so a failure here degrades to the
//! TypeScript path rather than taking down a recall.

use std::net::SocketAddr;

use axum::{routing::{get, post}, Json, Router};
use serde::{Deserialize, Serialize};

use kin_brain::gate::{evaluate_gate, GateInfo, GateResult, KeeperResult};
use kin_brain::weaver::{find_gaps, pick_top_gap, route_question, Gap, WeaverData};

#[derive(Deserialize)]
struct GateRequest {
    results: Vec<KeeperResult>,
    info: GateInfo,
}

async fn gate(Json(req): Json<GateRequest>) -> Json<GateResult> {
    Json(evaluate_gate(&req.results, &req.info))
}

#[derive(Serialize)]
struct WeaverResponse {
    gaps: Vec<Gap>,
    #[serde(rename = "topGap")]
    top_gap: Option<Gap>,
    #[serde(rename = "routedTo")]
    routed_to: Option<String>,
}

async fn weaver(Json(data): Json<WeaverData>) -> Json<WeaverResponse> {
    let top_gap = pick_top_gap(&data);
    let routed_to = top_gap.as_ref().and_then(|g| route_question(&data, g));
    Json(WeaverResponse { gaps: find_gaps(&data), top_gap, routed_to })
}

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "ok": true, "service": "kin-brain" }))
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();
    let port: u16 = std::env::var("KIN_BRAIN_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8787);

    let app = Router::new()
        .route("/health", get(health))
        .route("/gate", post(gate))
        .route("/weaver", post(weaver));

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let listener = tokio::net::TcpListener::bind(addr).await.expect("bind");
    tracing::info!("kin-brain listening on {addr}");
    axum::serve(listener, app).await.expect("serve");
}
