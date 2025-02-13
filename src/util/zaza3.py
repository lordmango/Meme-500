import sys
import pandas as pd
import numpy as np
import json
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression

# Load dataset from JSON file
file_path = "/Users/lord_mango/Meme-500/data/testdata.json"  # Update with your file path
with open(file_path, "r") as f:
    data = json.load(f)

# Convert to Pandas DataFrame
df = pd.DataFrame(data)

# Convert "3 Hr High %" to binary target (1 if >= 0.40, else 0)
df["Target"] = (df["3 Hr High %"] >= 1).astype(int)

# Filter dataset to only include Market Cap > 100,000
df = df[df["Market Cap"] > 100000]

# Create ratio features (handling division by zero)
df["P2 to P1 Candle Ratio"] = np.where(df["P1 Candle"] == 0, 0, df["P2 Candle"] / df["P1 Candle"])
df["P1 to Buy Candle Ratio"] = np.where(df["Buy Candle"] == 0, 0, df["P1 Candle"] / df["Buy Candle"])
df["P2 to Buy Candle Ratio"] = np.where(df["Buy Candle"] == 0, 0, df["P2 Candle"] / df["Buy Candle"])

df["P2 to P1 Volume Ratio"] = np.where(df["P1 Volume"] == 0, 0, df["P2 Volume"] / df["P1 Volume"])
df["P1 to Buy Volume Ratio"] = np.where(df["Buy Volume"] == 0, 0, df["P1 Volume"] / df["Buy Volume"])
df["P2 to Buy Volume Ratio"] = np.where(df["Buy Volume"] == 0, 0, df["P2 Volume"] / df["Buy Volume"])

# Select features for logistic regression
X = df[["Market Cap", "All Sold?", "Buy Candle", "P1 Candle", "P2 Candle",
        "Buy Volume", "P1 Volume", "P2 Volume",
        "P2 to P1 Candle Ratio", "P1 to Buy Candle Ratio", "P2 to Buy Candle Ratio",
        "P2 to P1 Volume Ratio", "P1 to Buy Volume Ratio", "P2 to Buy Volume Ratio"]]
y = df["Target"]

# Standardize features
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

# Train logistic regression model using all data
model = LogisticRegression()
model.fit(X_scaled, y)

# Check if command-line arguments are provided
if len(sys.argv) > 1:
    # Read input from command-line arguments (expecting 8 base inputs)
    args = list(map(float, sys.argv[1:9]))

    # Compute additional ratio features
    market_cap, all_sold, buy_candle, p1_candle, p2_candle, buy_volume, p1_volume, p2_volume = args
    p2_to_p1_candle_ratio = 0 if p1_candle == 0 else p2_candle / p1_candle
    p1_to_buy_candle_ratio = 0 if buy_candle == 0 else p1_candle / buy_candle
    p2_to_buy_candle_ratio = 0 if buy_candle == 0 else p2_candle / buy_candle
    p2_to_p1_volume_ratio = 0 if p1_volume == 0 else p2_volume / p1_volume
    p1_to_buy_volume_ratio = 0 if buy_volume == 0 else p1_volume / buy_volume
    p2_to_buy_volume_ratio = 0 if buy_volume == 0 else p2_volume / buy_volume

    # Create new transaction data as a DataFrame
    new_data = pd.DataFrame([[
        market_cap, all_sold, buy_candle, p1_candle, p2_candle,
        buy_volume, p1_volume, p2_volume,
        p2_to_p1_candle_ratio, p1_to_buy_candle_ratio, p2_to_buy_candle_ratio,
        p2_to_p1_volume_ratio, p1_to_buy_volume_ratio, p2_to_buy_volume_ratio
    ]], columns=X.columns)

    # Standardize the new data using the same scaler
    new_data_scaled = scaler.transform(new_data)

    # Predict probability
    predicted_prob = model.predict_proba(new_data_scaled)[:, 1][0]

    # Print only the probability (formatted to 4 decimal places)
    print(f"{predicted_prob:.4f}")

else:
    print("\n🚀 Model trained! Now enter a new transaction to predict its probability.\n")
