# frozen_string_literal: true

# Tiny HTTP wrapper around the e621ng/dtext gem. Used as the test oracle.
#
# Endpoints:
#   GET  /health              -> {"ok": true, "dtext_version": "..."}
#   POST /render              -> body: {"dtext": "...", "options": {...}}
#                                returns: {"html": "...", "post_ids": [...]}
#                                422 with {"error","message"} on DText::Error
#                                200 with {"html":"","post_ids":[],"error":"parse_returned_nil"} when parse returns nil

require "bundler/setup"
require "sinatra"
require "json"
require "dtext"

set :bind, "0.0.0.0"
set :port, (ENV["ORACLE_PORT"] || 4567).to_i
set :environment, :production
set :show_exceptions, false
set :raise_errors, false
set :logging, false
disable :protection

DTEXT_VERSION = (Gem.loaded_specs["dtext"]&.version&.to_s || "unknown").freeze

get "/health" do
  content_type :json
  { ok: true, dtext_version: DTEXT_VERSION }.to_json
end

post "/render" do
  request.body.rewind
  raw = request.body.read
  payload =
    begin
      JSON.parse(raw)
    rescue JSON::ParserError => e
      status 400
      content_type :json
      return ({ error: "bad_json", message: e.message }).to_json
    end

  text = payload["dtext"].to_s
  options = (payload["options"] || {}).each_with_object({}) { |(k, v), h| h[k.to_sym] = v }

  begin
    parsed = DText.parse(text, **options)
  rescue DText::Error => e
    status 422
    content_type :json
    return ({ error: "dtext_error", message: e.message }).to_json
  end

  content_type :json
  if parsed.nil?
    return ({ html: "", post_ids: [], error: "parse_returned_nil" }).to_json
  end

  html = parsed[0].to_s
  post_ids = parsed[1].is_a?(Array) ? parsed[1] : []
  ({ html: html, post_ids: post_ids }).to_json
end
