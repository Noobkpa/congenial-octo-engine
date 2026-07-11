<?php
declare(strict_types=1);

const GH_API = 'https://api.github.com';

function cors_headers(): void {
	header('Access-Control-Allow-Origin: *');
	header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
	header('Access-Control-Allow-Headers: Content-Type, Authorization, Accept, X-GitHub-Api-Version, User-Agent');
	header('Access-Control-Max-Age: 86400');
}

function json_response(array $data, int $status = 200): void {
	http_response_code($status);
	header('Content-Type: application/json; charset=utf-8');
	cors_headers();
	echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
	exit;
}

function forward_request(string $method, string $path, mixed $body, array $clientHeaders = []): void {
	$target = str_starts_with($path, 'http')
		? $path
		: GH_API . '/' . ltrim($path, '/');

	if (!str_starts_with($target, GH_API . '/')) {
		json_response(['error' => 'Only GitHub API paths are allowed'], 400);
	}

	$headers = [
		'Accept: application/vnd.github+json',
		'X-GitHub-Api-Version: 2022-11-28',
		'User-Agent: Blog-Editor-Proxy',
	];

	foreach ($clientHeaders as $key => $value) {
		if (!is_string($value)) continue;
		$lower = strtolower((string) $key);
		if ($lower === 'host' || $lower === 'content-length') continue;
		$headers[] = $key . ': ' . $value;
	}

	$ch = curl_init($target);
	curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
	curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
	curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
	curl_setopt($ch, CURLOPT_HEADER, true);
	curl_setopt($ch, CURLOPT_TIMEOUT, 30);
	curl_setopt($ch, CURLOPT_FOLLOWLOCATION, false);

	if ($body !== null && $method !== 'GET') {
		$payload = is_string($body) ? $body : json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
		curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
		$headers[] = 'Content-Type: application/json';
		curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
	}

	$response = curl_exec($ch);
	if ($response === false) {
		$error = curl_error($ch);
		curl_close($ch);
		json_response(['error' => 'Proxy request failed', 'message' => $error], 502);
	}

	$status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
	$headerSize = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
	$responseHeaders = substr($response, 0, $headerSize);
	$responseBody = substr($response, $headerSize);
	curl_close($ch);

	http_response_code($status);
	cors_headers();
	$contentType = 'application/json; charset=utf-8';
	foreach (explode("\r\n", $responseHeaders) as $line) {
		if (stripos($line, 'content-type:') === 0) {
			$contentType = trim(substr($line, strlen('content-type:')));
			break;
		}
	}
	header('Content-Type: ' . $contentType);
	echo $responseBody;
	exit;
}

cors_headers();

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
	http_response_code(204);
	exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
	$path = $_GET['path'] ?? '';
	if ($path === '') {
		json_response([
			'ok' => true,
			'status' => 'proxy-ready',
			'serverAuth' => false,
			'hasAppId' => false,
			'appId' => '',
			'message' => 'GitHub proxy is running. Import your GitHub App PEM key to authenticate.',
		]);
	}
	forward_request('GET', (string) $path, null, []);
}

if (in_array($_SERVER['REQUEST_METHOD'], ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
	$raw = file_get_contents('php://input') ?: '';
	$data = json_decode($raw, true);
	if (!is_array($data)) {
		json_response(['error' => 'Invalid JSON body'], 400);
	}

	$path = $data['path'] ?? '';
	if (!is_string($path) || $path === '') {
		json_response(['error' => "Missing 'path' field in request body"], 400);
	}

	$method = strtoupper((string) ($data['method'] ?? $_SERVER['REQUEST_METHOD']));
	$headers = is_array($data['headers'] ?? null) ? $data['headers'] : [];
	$body = $data['body'] ?? null;

	forward_request($method, $path, $body, $headers);
}

json_response(['error' => 'Method not allowed'], 405);
