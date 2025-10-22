package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"

	"github.com/gorilla/websocket"
	_ "github.com/go-sql-driver/mysql"
)

// ----------------- Models -----------------
type Product struct {
	ID         int     `json:"id"`
	Name       string  `json:"name"`
	Price      float64 `json:"price"`
	Categories string  `json:"categories"`
	Image      string  `json:"image"`
}

type CustomerData map[string]string

type CartItem struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`       // ignored by server
	Price     float64 `json:"price"`      // ignored by server
	Quantity  int     `json:"quantity"`
	TotalPrice float64 `json:"totalPrice"` // ignored by server
}

type CheckoutPayload struct {
	Customer      CustomerData `json:"customer"`
	PaymentMethod string       `json:"paymentMethod"`
	Items         []CartItem   `json:"items"`
	GrandTotal    float64      `json:"grandTotal"` // ignored by server
}

type CheckoutResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message,omitempty"`
}

// ----------------- Global DB -----------------
var db *sql.DB

func initDB() {
	var err error
	db, err = sql.Open("mysql", "root:@tcp(127.0.0.1:3306)/ecommerce_db")
	if err != nil {
		log.Fatal("DB connection error:", err)
	}
	if err := db.Ping(); err != nil {
		log.Fatal("DB ping error:", err)
	}
	log.Println("Connected to MySQL successfully!")
}

// ----------------- WebSocket Hub -----------------
type WSClient struct {
	conn *websocket.Conn
	send chan []byte
}

type WSHub struct {
	clients map[*WSClient]bool
	mu      sync.Mutex
}

var hub = WSHub{
	clients: make(map[*WSClient]bool),
}

func (h *WSHub) AddClient(client *WSClient) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[client] = true
}

func (h *WSHub) RemoveClient(client *WSClient) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.clients, client)
	client.conn.Close()
}

func (h *WSHub) Broadcast(message []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for client := range h.clients {
		if err := client.conn.WriteMessage(websocket.TextMessage, message); err != nil {
			fmt.Println("[WS] Write error, removing client:", err)
			delete(h.clients, client)
			client.conn.Close()
		}
	}
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func wsOrdersHandler(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		http.Error(w, "Failed to upgrade WS", http.StatusInternalServerError)
		return
	}

	client := &WSClient{
		conn: conn,
		send: make(chan []byte),
	}
	hub.AddClient(client)
	fmt.Println("[WS] New client connected")

	// Read messages from client
	go func() {
		defer hub.RemoveClient(client)
		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				fmt.Println("[WS] Client disconnected")
				break
			}
			handleWSMessage(msg)
		}
	}()
}

func handleWSMessage(message []byte) {
	var msg struct {
		Type    string `json:"type"`
		OrderID int    `json:"order_id"`
		Status  string `json:"status"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		fmt.Println("[WS] Failed to parse message:", err)
		return
	}

	if msg.Type == "confirm_order" {
		if msg.Type == "confirm_order" {
			_, err := db.Exec("UPDATE orders SET status=? WHERE id=?", msg.Status, msg.OrderID)
			if err != nil {
				fmt.Println("[WS] Failed to update order status:", err)
				return
			}
			fmt.Println("[WS] Order confirmed:", msg.OrderID)
		
			// Fetch updated order info from DB (optional)
			row := db.QueryRow(`
				SELECT customer_name, customer_contact, customer_address, payment_method, grand_total, STATUS 
				FROM orders 
				WHERE id=?
			`, msg.OrderID)
			var name, contact, address, paymentMethod, status string
			var total float64
			if err := row.Scan(&name, &contact, &address, &paymentMethod, &total, &status); err != nil {
				fmt.Println("[WS] Failed to fetch updated order:", err)
				return
			}
			updateMsg := map[string]interface{}{
				"type": "update_order",
				"order_id": msg.OrderID,
				"status": msg.Status,
			}
			msgBytes, _ := json.Marshal(updateMsg)
			hub.Broadcast(msgBytes)
		}
	}
}

// ----------------- Handlers -----------------
func productsHandler(w http.ResponseWriter, r *http.Request) {
	file, err := os.ReadFile("./db/products.json")
	if err != nil {
		http.Error(w, "Failed to load products", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write(file)
}

func listOrdersHandler(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Query(`
    SELECT id, customer_name, customer_contact, customer_address, payment_method, grand_total, STATUS 
    FROM orders 
	WHERE STATUS = 'pending'
    ORDER BY created_at DESC
	`)
	if err != nil {
		http.Error(w, "DB query error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var orders []map[string]interface{}
	for rows.Next() {
		var id int
		var name, contact, address, paymentMethod, status string
		var total float64

		if err := rows.Scan(&id, &name, &contact, &address, &paymentMethod, &total, &status); err != nil {
			http.Error(w, "DB scan error: "+err.Error(), http.StatusInternalServerError)
			return
		}

		orders = append(orders, map[string]interface{}{
			"id":            id,
			"name":          name,
			"contact":       contact,
			"address":       address,
			"paymentMethod": paymentMethod,
			"total":         total,
			"status":        status,
		})
	}

	if orders == nil {
        orders = []map[string]interface{}{} 
    }
	
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(orders); err != nil {
		http.Error(w, "JSON encode error: "+err.Error(), http.StatusInternalServerError)
		return
	}
}

func checkoutHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		http.ServeFile(w, r, "./dist/checkout/index.html")
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var payload CheckoutPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	total := 0.0
	for _, item := range payload.Items {
		idNum, err := strconv.Atoi(item.ID)
		if err != nil {
			http.Error(w, "Invalid product ID format: "+item.ID, http.StatusBadRequest)
			return
		}

		var dbPrice float64
		var dbName string
		err = db.QueryRow("SELECT name, price FROM products WHERE id = ?", idNum).Scan(&dbName, &dbPrice)
		if err != nil {
			http.Error(w, "Invalid product ID: "+item.ID, http.StatusBadRequest)
			return
		}
		total += dbPrice * float64(item.Quantity)
	}

	itemsJSON, err := json.Marshal(payload.Items)
	if err != nil {
		http.Error(w, "Failed to encode items", http.StatusInternalServerError)
		return
	}

	stmt, err := db.Prepare(`
        INSERT INTO orders
        (customer_name, customer_contact, customer_address, payment_method, items, grand_total)
        VALUES (?, ?, ?, ?, ?, ?)
    `)
	if err != nil {
		http.Error(w, "DB prepare error", http.StatusInternalServerError)
		return
	}
	defer stmt.Close()

	res, err := stmt.Exec(
		payload.Customer["name"],
		payload.Customer["contact"],
		payload.Customer["address"],
		payload.PaymentMethod,
		string(itemsJSON),
		total,
	)
	if err != nil {
		http.Error(w, "DB insert error", http.StatusInternalServerError)
		return
	}

	orderID64, err := res.LastInsertId()
	if err != nil {
		http.Error(w, "Failed to get order ID", http.StatusInternalServerError)
		return
	}
	orderID := int(orderID64)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(CheckoutResponse{Success: true, Message: "Order received"})

	// Broadcast new order HTML fragment
	htmlFragment := fmt.Sprintf(`
	<div class="order-fragment" data-order-id="%d">
	<h3>Order #%d</h3>
	<p><strong>Name:</strong> %s</p>
	<p><strong>Contact:</strong> %s</p>
	<p><strong>Address:</strong> %s</p>
	<ul>
	`, orderID, orderID, payload.Customer["name"], payload.Customer["contact"], payload.Customer["address"])

	for _, item := range payload.Items {
		htmlFragment += fmt.Sprintf("<li>%s x %d - $%.2f</li>", item.Name, item.Quantity, item.Price*float64(item.Quantity))
	}
	htmlFragment += fmt.Sprintf("</ul><p><strong>Grand Total:</strong> $%.2f</p><button class='confirm-btn'>Confirm Order</button></div>", total)

	fmt.Println("[WS] Broadcasting new order HTML fragment...")
	hub.Broadcast([]byte(htmlFragment))
	fmt.Println("[WS] Broadcast complete")
}

// ----------------- Dashboard & Static -----------------
func dashboardHandler(adminSecret string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		key := r.URL.Query().Get("secret_key")
		if key != adminSecret {
			http.NotFound(w, r)
			return
		}
		
		http.ServeFile(w, r, "./dist/dashboard/index.html")
	}
}

// ----------------- Main -----------------
func main() {
	initDB()
	defer db.Close()

	adminSecret := os.Getenv("ADMIN_SECRET_KEY")
	if adminSecret == "" {
		adminSecret = "kishi"
	}

	log.Println("Admin secret is:", adminSecret)

	fs := http.FileServer(http.Dir("./dist"))
	http.Handle("/assets/", fs)
	http.Handle("/_astro", fs)
	http.Handle("/favicon.ico", fs)

	http.HandleFunc("/panel", dashboardHandler(adminSecret))
	http.HandleFunc("/products.json", productsHandler)
	http.HandleFunc("/checkout", checkoutHandler)
	http.HandleFunc("/api/orders", listOrdersHandler)
	http.HandleFunc("/ws/orders", wsOrdersHandler)

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		path := "./dist" + r.URL.Path
		if strings.HasPrefix(r.URL.Path, "/dashboard") {
			http.NotFound(w, r)
			return
		}
		if _, err := os.Stat(path); os.IsNotExist(err) || r.URL.Path == "/panel" {
			path = "./dist/index.html"
		}
		http.ServeFile(w, r, path)
	})

	log.Println("Server started on :8000")
	log.Fatal(http.ListenAndServe(":8000", nil))
}
